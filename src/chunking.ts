// Pure chunking logic (no vscode import) so it can be unit tested.

export interface Span { start: number; end: number; name?: string }

export const MAX_GAP_LINES = 10;

/**
 * One chunk per top-level function; code between functions is cut into blocks
 * of at most `maxGap` lines, skipping blank blocks. Lines are 0-based, inclusive.
 * Functions starting inside an earlier function (nested) are skipped.
 */
export function chunkSpans(
  lineCount: number,
  fns: Span[],
  isBlank: (start: number, end: number) => boolean,
  maxGap = MAX_GAP_LINES,
): Span[] {
  const last = lineCount - 1;
  const out: Span[] = [];
  const addGap = (from: number, to: number) => {
    for (let s = from; s <= to; s += maxGap) {
      const e = Math.min(s + maxGap - 1, to);
      if (!isBlank(s, e)) out.push({ start: s, end: e });
    }
  };

  let cursor = 0;
  for (const f of [...fns].sort((a, b) => a.start - b.start)) {
    if (f.start < cursor || f.start > last) continue;
    addGap(cursor, f.start - 1);
    const end = Math.min(f.end, last);
    out.push({ start: f.start, end, name: f.name });
    cursor = end + 1;
  }
  addGap(cursor, last);
  return out;
}
