import type { Chunk } from './chunking';

export type Mode = 'author' | 'newcomer';

/**
 * Produces an instant, rule-based explanation of a chunk without any LLM call.
 * The result is shown immediately as a placeholder that the LLM output replaces.
 */
export function ruleBasedExplain(chunk: Chunk, mode: Mode): string {
  const patterns = detectPatterns(chunk.text);
  const label = chunk.name ? humanize(chunk.name) : 'This block';

  if (mode === 'author') {
    return patterns.length
      ? `${label}: ${patterns.join('; ')}.`
      : `${label} (${nonBlankLines(chunk.text)} lines).`;
  }

  // newcomer: slightly more descriptive
  const verb = patterns[0] ?? 'runs some logic';
  const base = chunk.name
    ? `\`${chunk.name}\` is a function that ${verb}.`
    : `This block ${verb}.`;
  return patterns.length > 1
    ? `${base} It also ${patterns.slice(1).join('; ')}.`
    : base;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectPatterns(code: string): string[] {
  const patterns: string[] = [];

  if (/\b(for|while|forEach|for\s*\.\.\.(?:of|in))\b/.test(code)) {
    if (/\+=|-=|\*=/.test(code))          patterns.push('accumulates a value');
    else if (/\.push\(|\.append\(/.test(code)) patterns.push('builds a list');
    else                                   patterns.push('iterates over a collection');
  }

  if (/\bif\b[^{]*\breturn\b/.test(code) && !/\belse\b/.test(code))
    patterns.push('guards with an early return');

  if (/\btry\b/.test(code))   patterns.push('handles errors with try/catch');
  if (/\bawait\b/.test(code)) patterns.push('performs async operations');
  if (/\bthrow\b/.test(code)) patterns.push('throws on unexpected state');
  if (/\bswitch\b/.test(code)) patterns.push('branches on a value');

  return patterns;
}

/** "getUserById" → "Get user by id" */
function humanize(name: string): string {
  const words = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .split(' ')
    .filter(Boolean);
  words[0] = words[0][0].toUpperCase() + words[0].slice(1);
  return words.join(' ');
}

function nonBlankLines(text: string): number {
  return text.split('\n').filter(l => l.trim()).length;
}
