import * as vscode from 'vscode';

type Mode = 'author' | 'newcomer';
interface Chunk { start: number; end: number; text: string; name?: string }

const MAX_GAP_LINES = 10;

let panel: vscode.WebviewPanel | undefined;
let source: vscode.TextEditor | undefined;
let mode: Mode = 'author';
let chunks: Chunk[] = [];
let timer: NodeJS.Timeout | undefined;

export function activate(ctx: vscode.ExtensionContext) {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('codeLyrics.open', () => open(ctx)),
    vscode.window.onDidChangeActiveTextEditor(e => {
      if (panel && e) { source = e; refresh(); }
    }),
    vscode.workspace.onDidChangeTextDocument(e => {
      if (panel && source && e.document === source.document) {
        clearTimeout(timer);
        timer = setTimeout(refresh, 500); // debounce while typing
      }
    }),
    vscode.window.onDidChangeTextEditorVisibleRanges(e => {
      if (panel && e.textEditor === source) syncActive('scroll');
    }),
    vscode.window.onDidChangeTextEditorSelection(e => {
      if (panel && e.textEditor === source) syncActive('cursor');
    })
  );
}

async function open(ctx: vscode.ExtensionContext) {
  source = vscode.window.activeTextEditor;
  if (!source) {
    vscode.window.showInformationMessage('Open a code file first.');
    return;
  }
  if (panel) { panel.reveal(vscode.ViewColumn.Beside, true); await refresh(); return; }

  panel = vscode.window.createWebviewPanel(
    'codeLyrics', 'Code Lyrics',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true }
  );
  panel.webview.html = html();
  panel.onDidDispose(() => { panel = undefined; }, null, ctx.subscriptions);
  panel.webview.onDidReceiveMessage(msg => {
    if (msg.type === 'ready') refresh();
    if (msg.type === 'mode') { mode = msg.mode; refresh(); }
    if (msg.type === 'reveal' && source) {
      const p = new vscode.Position(msg.line, 0);
      source.revealRange(new vscode.Range(p, p), vscode.TextEditorRevealType.AtTop);
    }
  }, null, ctx.subscriptions);
}

async function refresh() {
  if (!panel || !source) return;
  const doc = source.document;
  chunks = await buildChunks(doc);
  panel.webview.postMessage({
    type: 'chunks',
    mode,
    file: vscode.workspace.asRelativePath(doc.uri),
    items: chunks.map(c => ({
      start: c.start + 1,
      end: c.end + 1,
      name: c.name ?? '',
      text: explain(c, mode),
    })),
  });
  syncActive('scroll');
}

// STUB: swap this for rule-based / LLM explanations later.
function explain(c: Chunk, m: Mode): string {
  const first = c.text.split('\n').find(l => l.trim())?.trim() ?? '';
  const what = c.name ? `function ${c.name}` : 'this block';
  return m === 'author'
    ? `Quick summary of ${what} goes here. Starts with: ${first}`
    : `A step-by-step walkthrough of ${what} for someone new goes here. Starts with: ${first}`;
}

function syncActive(why: 'scroll' | 'cursor') {
  if (!panel || !source || !chunks.length) return;
  let line: number;
  if (why === 'cursor') {
    line = source.selection.active.line;
  } else {
    const vr = source.visibleRanges[0];
    if (!vr) return;
    line = vr.start.line + Math.floor((vr.end.line - vr.start.line) / 3);
  }
  let idx = chunks.findIndex(c => line >= c.start && line <= c.end);
  if (idx < 0) idx = Math.max(0, chunks.findLastIndex(c => c.start <= line));
  panel.webview.postMessage({ type: 'active', index: idx });
}

type Sym = vscode.DocumentSymbol | vscode.SymbolInformation;
const rangeOf = (s: Sym) => ('range' in s ? s.range : s.location.range);

async function buildChunks(doc: vscode.TextDocument): Promise<Chunk[]> {
  const syms = (await vscode.commands.executeCommand<Sym[]>(
    'vscode.executeDocumentSymbolProvider', doc.uri)) ?? [];

  const kinds = [vscode.SymbolKind.Function, vscode.SymbolKind.Method, vscode.SymbolKind.Constructor];
  const fns: Sym[] = [];
  const walk = (list: Sym[]) => {
    for (const s of list) {
      if (kinds.includes(s.kind)) fns.push(s);
      else if ('children' in s) walk(s.children);
    }
  };
  walk(syms);
  fns.sort((a, b) => rangeOf(a).start.line - rangeOf(b).start.line);

  const out: Chunk[] = [];
  const addGap = (from: number, to: number) => {
    for (let s = from; s <= to; s += MAX_GAP_LINES) {
      const e = Math.min(s + MAX_GAP_LINES - 1, to);
      const text = doc.getText(new vscode.Range(s, 0, e, doc.lineAt(e).text.length));
      if (text.trim()) out.push({ start: s, end: e, text });
    }
  };

  let cursor = 0;
  for (const f of fns) {
    const r = rangeOf(f);
    if (r.start.line < cursor) continue; // skip nested functions
    addGap(cursor, r.start.line - 1);
    out.push({ start: r.start.line, end: r.end.line, text: doc.getText(r), name: f.name });
    cursor = r.end.line + 1;
  }
  addGap(cursor, doc.lineCount - 1);
  return out;
}

function html(): string {
  const nonce = Array.from({ length: 24 }, () => Math.random().toString(36)[2]).join('');
  return /* html */ `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style nonce="${nonce}">
  :root { --accent: var(--vscode-focusBorder, #3794ff); }
  body { margin: 0; font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); }
  header { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 10px 20px; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border, transparent); }
  #file { font-size: 12px; opacity: .6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .modes { display: flex; gap: 2px; padding: 2px; border-radius: 6px; background: var(--vscode-input-background); }
  .modes button { font: inherit; font-size: 12px; padding: 3px 10px; border: 0; border-radius: 4px; cursor: pointer;
    color: var(--vscode-foreground); background: transparent; opacity: .65; }
  .modes button[aria-pressed="true"] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); opacity: 1; }
  .modes button:focus-visible { outline: 1px solid var(--accent); }
  #list { padding: 40vh 24px; max-width: 62ch; margin: 0 auto; }
  .row { --d: 4; padding: 10px 0 10px 14px; border-left: 2px solid transparent; cursor: pointer;
    transform-origin: left center; transform: scale(.94);
    opacity: max(.2, calc(1 - var(--d) * .26));
    transition: opacity .35s ease, transform .35s ease, border-color .35s ease; }
  .row.active { transform: scale(1); border-left-color: var(--accent); }
  .meta { font-size: 11px; opacity: .6; margin-bottom: 2px; font-variant-numeric: tabular-nums; }
  .text { font-size: 17px; line-height: 1.5; }
  .row:focus-visible { outline: 1px solid var(--accent); }
  #empty { opacity: .6; padding: 24px; }
  @media (prefers-reduced-motion: reduce) { .row { transition: none; } }
</style></head>
<body>
<header>
  <span id="file"></span>
  <div class="modes" role="group" aria-label="Explanation mode">
    <button data-mode="author" aria-pressed="true">Author</button>
    <button data-mode="newcomer" aria-pressed="false">Newcomer</button>
  </div>
</header>
<div id="list"></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const list = document.getElementById('list');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let rows = [], pauseUntil = 0;

  document.querySelectorAll('[data-mode]').forEach(b =>
    b.addEventListener('click', () => vscode.postMessage({ type: 'mode', mode: b.dataset.mode })));
  ['wheel', 'touchstart'].forEach(ev =>
    addEventListener(ev, () => { pauseUntil = Date.now() + 3000; }, { passive: true }));

  addEventListener('message', ({ data }) => {
    if (data.type === 'chunks') render(data);
    if (data.type === 'active') setActive(data.index);
  });

  function render(d) {
    document.getElementById('file').textContent = d.file;
    document.querySelectorAll('[data-mode]').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.mode === d.mode)));
    list.textContent = '';
    rows = d.items.map(it => {
      const row = document.createElement('div');
      row.className = 'row'; row.tabIndex = 0;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = (it.name ? it.name + ', ' : '') + 'lines ' + it.start + '-' + it.end;
      const text = document.createElement('div');
      text.className = 'text'; text.textContent = it.text;
      row.append(meta, text);
      const go = () => vscode.postMessage({ type: 'reveal', line: it.start - 1 });
      row.addEventListener('click', go);
      row.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      list.append(row);
      return row;
    });
    if (!rows.length) list.innerHTML = '<div id="empty">Nothing to explain in this file yet.</div>';
  }

  function setActive(i) {
    rows.forEach((r, j) => {
      r.style.setProperty('--d', Math.min(Math.abs(j - i), 4));
      r.classList.toggle('active', j === i);
    });
    if (rows[i] && Date.now() > pauseUntil)
      rows[i].scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }

  vscode.postMessage({ type: 'ready' });
</script></body></html>`;
}

export function deactivate() {}
