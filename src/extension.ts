import * as vscode from 'vscode';
import { chunkSpans, Chunk, Span } from './chunking';
import { panelHtml } from './panel';
import { getConfig, getApiKey, setApiKey, updateConfigValue, promptSetApiKey } from './config';
import { clearConsent, shouldSkip } from './safety';
import { Explainer, ChunkResult } from './explainer';
import type { Mode } from './rules';

// ---------------------------------------------------------------------------
// Module-level state (single panel, single source editor)
// ---------------------------------------------------------------------------

let panel: vscode.WebviewPanel | undefined;
let source: vscode.TextEditor | undefined;
let mode: Mode = 'author';
let chunks: Chunk[] = [];
let results: ChunkResult[] = [];
let explainer: Explainer;
let statusBar: vscode.StatusBarItem;
let debounceTimer: NodeJS.Timeout | undefined;

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(ctx: vscode.ExtensionContext): void {
  explainer = new Explainer(ctx.secrets, ctx.globalState, ctx.workspaceState);

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'codeLyrics.setApiKey';
  ctx.subscriptions.push(statusBar);

  ctx.subscriptions.push(
    vscode.commands.registerCommand('codeLyrics.open',
      () => open(ctx)),
    vscode.commands.registerCommand('codeLyrics.setApiKey',
      () => promptSetApiKey(ctx.secrets)),
    vscode.commands.registerCommand('codeLyrics.clearConsent',
      () => clearConsent(ctx.globalState)),
    vscode.commands.registerCommand('codeLyrics.refresh',
      () => refresh()),

    vscode.window.onDidChangeActiveTextEditor(e => {
      if (panel && e) { source = e; refresh(); }
    }),
    vscode.workspace.onDidChangeTextDocument(e => {
      if (!panel || !source || e.document !== source.document) return;
      markStale();
      if (getConfig().liveMode) scheduleRefresh(1500);
    }),
    vscode.window.onDidChangeTextEditorVisibleRanges(e => {
      if (panel && e.textEditor === source) syncActive('scroll');
    }),
    vscode.window.onDidChangeTextEditorSelection(e => {
      if (panel && e.textEditor === source) syncActive('cursor');
    }),
    vscode.workspace.onDidSaveTextDocument(doc => {
      if (panel && source && doc === source.document && getConfig().refreshOnSave) refresh();
    }),
  );
}

export function deactivate(): void {
  explainer?.cancel();
}

// ---------------------------------------------------------------------------
// Panel lifecycle
// ---------------------------------------------------------------------------

async function open(ctx: vscode.ExtensionContext): Promise<void> {
  source = vscode.window.activeTextEditor;
  if (!source) {
    vscode.window.showInformationMessage('Code Lyrics: open a code file first.');
    return;
  }

  if (panel) { panel.reveal(vscode.ViewColumn.Beside, true); await refresh(); return; }

  panel = vscode.window.createWebviewPanel(
    'codeLyrics', 'Code Lyrics',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(ctx.extensionUri, 'media')],
    },
  );

  panel.webview.html = panelHtml(
    panel.webview,
    vscode.Uri.joinPath(ctx.extensionUri, 'media'),
  );

  panel.onDidDispose(() => {
    explainer.cancel();
    panel = undefined;
    statusBar.hide();
  }, null, ctx.subscriptions);

  panel.webview.onDidReceiveMessage(async msg => {
    switch (msg.type) {
      case 'ready': {
        await syncSettingsToPanel(ctx.secrets);
        await refresh();
        break;
      }
      case 'mode':
        setMode(msg.mode as Mode);
        break;
      case 'refresh':
        refresh();
        break;
      case 'reveal':
        revealLine(msg.line as number);
        break;
      case 'setApiKey': {
        try {
          await setApiKey(ctx.secrets, msg.provider, msg.apiKey);
          panel?.webview.postMessage({ type: 'keySaved', success: true });
          updateStatusBar();
          refresh();
        } catch (err) {
          panel?.webview.postMessage({ type: 'keySaved', success: false, error: String(err) });
        }
        break;
      }
      case 'updateConfig': {
        await updateConfigValue(msg.key, msg.value);
        updateStatusBar();
        refresh();
        break;
      }
    }
  }, null, ctx.subscriptions);

  updateStatusBar();
  syncSettingsToPanel(ctx.secrets);
}

async function syncSettingsToPanel(secrets: vscode.SecretStorage): Promise<void> {
  if (!panel) return;
  const cfg = getConfig();
  const key = await getApiKey(secrets, cfg.provider);
  panel.webview.postMessage({
    type: 'initSettings',
    config: {
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      hasKey: !!key,
    },
  });
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

async function refresh(): Promise<void> {
  if (!panel || !source) return;

  if (shouldSkip(source.document.uri)) {
    panel.webview.postMessage({ type: 'skip', reason: 'This file is excluded from Code Lyrics.' });
    return;
  }

  explainer.cancel();
  chunks = await buildChunks(source.document);
  results = chunks.map(() => ({ text: '…', stale: false }));
  postChunks();

  const cfg = getConfig();
  await explainer.explain(
    source.document,
    chunks,
    visibleChunkIndices(),
    mode,
    cfg,
    (index, result) => {
      results[index] = result;
      panel?.webview.postMessage({ type: 'update', index, ...result });
    },
  );
}

function markStale(): void {
  if (!panel) return;
  for (let i = 0; i < results.length; i++) {
    if (!results[i].stale) {
      results[i] = { ...results[i], stale: true };
      panel.webview.postMessage({ type: 'stale', index: i });
    }
  }
}

function setMode(next: Mode): void {
  mode = next;
  refresh();
}

function revealLine(line: number): void {
  if (!source) return;
  const pos = new vscode.Position(line, 0);
  source.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.AtTop);
}

function syncActive(trigger: 'scroll' | 'cursor'): void {
  if (!panel || !chunks.length) return;

  const line = trigger === 'cursor'
    ? source!.selection.active.line
    : midViewportLine();

  let idx = chunks.findIndex(c => line >= c.start && line <= c.end);
  if (idx < 0) idx = Math.max(0, chunks.findLastIndex(c => c.start <= line));
  panel.webview.postMessage({ type: 'active', index: idx });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function postChunks(): void {
  if (!panel || !source) return;
  panel.webview.postMessage({
    type: 'chunks',
    mode,
    file: vscode.workspace.asRelativePath(source.document.uri),
    items: chunks.map((c, i) => ({
      start: c.start + 1,
      end:   c.end   + 1,
      name:  c.name ?? '',
      text:  results[i].text,
      stale: results[i].stale,
      error: results[i].error,
    })),
  });
  syncActive('scroll');
}

function scheduleRefresh(ms: number): void {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(refresh, ms);
}

function midViewportLine(): number {
  const vr = source?.visibleRanges[0];
  return vr ? vr.start.line + Math.floor((vr.end.line - vr.start.line) / 3) : 0;
}

function visibleChunkIndices(): number[] {
  if (!source || !chunks.length) return [];
  const vr = source.visibleRanges[0];
  if (!vr) return [];
  return chunks.reduce<number[]>((acc, c, i) => {
    if (c.end >= vr.start.line && c.start <= vr.end.line) acc.push(i);
    return acc;
  }, []);
}

function updateStatusBar(): void {
  const { provider, model } = getConfig();
  statusBar.text = `$(sync) ${provider} · ${model}`;
  statusBar.tooltip = 'Code Lyrics: click to set API key';
  statusBar.show();
}

// ---------------------------------------------------------------------------
// Chunking (VS Code API layer on top of pure chunkSpans)
// ---------------------------------------------------------------------------

type Sym = vscode.DocumentSymbol | vscode.SymbolInformation;
const rangeOf = (s: Sym): vscode.Range => 'range' in s ? s.range : s.location.range;

async function buildChunks(doc: vscode.TextDocument): Promise<Chunk[]> {
  const syms = (await vscode.commands.executeCommand<Sym[]>(
    'vscode.executeDocumentSymbolProvider', doc.uri,
  )) ?? [];

  const FN_KINDS = new Set([
    vscode.SymbolKind.Function,
    vscode.SymbolKind.Method,
    vscode.SymbolKind.Constructor,
  ]);

  const fns: Span[] = [];
  const walk = (list: Sym[]): void => {
    for (const s of list) {
      if (FN_KINDS.has(s.kind)) {
        const r = rangeOf(s);
        fns.push({ start: r.start.line, end: r.end.line, name: s.name });
      } else if ('children' in s) {
        walk(s.children);
      }
    }
  };
  walk(syms);

  const isBlank = (s: number, e: number): boolean =>
    !doc.getText(new vscode.Range(s, 0, e, doc.lineAt(e).text.length)).trim();

  const spans = chunkSpans(doc.lineCount, fns, isBlank);

  return spans.map(sp => ({
    ...sp,
    text: doc.getText(new vscode.Range(sp.start, 0, sp.end, doc.lineAt(sp.end).text.length)),
  }));
}
