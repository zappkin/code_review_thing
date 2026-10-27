import * as vscode from 'vscode';
import type { Chunk } from './chunking';
import { redact } from './safety';

const MAX_CONTEXT_CHARS = 2000;
const DEFINITION_TIMEOUT_MS = 1500;

/**
 * Assembles context for a chunk to send alongside it to the LLM:
 *   - The file header (imports / top-level declarations, up to 10 lines)
 *   - Text of functions called within the chunk (same-document definitions only)
 *
 * Returns a redacted, size-capped string, or undefined if there is nothing useful.
 */
export async function gatherContext(
  doc: vscode.TextDocument,
  chunk: Chunk,
): Promise<string | undefined> {
  const parts: string[] = [];

  const headerEnd = Math.min(9, chunk.start - 1);
  if (headerEnd >= 0) {
    const header = doc.getText(new vscode.Range(0, 0, headerEnd, Number.MAX_SAFE_INTEGER)).trim();
    if (header) parts.push(`// file header\n${header}`);
  }

  const defs = await sameDocumentDefinitions(doc, chunk);
  if (defs.length) parts.push(`// called definitions\n${defs.join('\n---\n')}`);

  if (!parts.length) return undefined;

  const ctx = redact(parts.join('\n\n'));
  return ctx.length > MAX_CONTEXT_CHARS
    ? ctx.slice(0, MAX_CONTEXT_CHARS) + '\n// [context truncated]'
    : ctx;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function sameDocumentDefinitions(doc: vscode.TextDocument, chunk: Chunk): Promise<string[]> {
  const results: string[] = [];
  const seen = new Set<string>();

  for (let line = chunk.start; line <= chunk.end; line++) {
    const lineText = doc.lineAt(line).text;
    for (const [, name] of lineText.matchAll(/\b([A-Za-z_]\w+)\s*\(/g)) {
      if (seen.has(name)) continue;
      seen.add(name);

      const callCol = lineText.indexOf(name);
      const definition = await withTimeout(
        resolveDefinition(doc, line, callCol),
        DEFINITION_TIMEOUT_MS,
      );
      if (definition) results.push(definition);
    }
  }
  return results;
}

async function resolveDefinition(
  doc: vscode.TextDocument,
  line: number,
  col: number,
): Promise<string | undefined> {
  try {
    const locs = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
      'vscode.executeDefinitionProvider', doc.uri, new vscode.Position(line, col),
    );
    if (!locs?.length) return undefined;

    const loc = 'targetUri' in locs[0]
      ? { uri: locs[0].targetUri, range: locs[0].targetRange }
      : { uri: locs[0].uri, range: locs[0].range };

    // Only include same-document definitions to avoid pulling in library code.
    if (loc.uri.toString() !== doc.uri.toString()) return undefined;

    const text = doc.getText(loc.range).trim();
    return text && text !== doc.getText(new vscode.Range(
      new vscode.Position(line, col), new vscode.Position(line, col),
    )) ? text : undefined;
  } catch {
    return undefined;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    p,
    new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), ms)),
  ]);
}
