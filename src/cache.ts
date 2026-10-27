import * as vscode from 'vscode';
import { createHash } from 'crypto';

const STORE_KEY = 'codeLyrics.cache';
const MAX_ENTRIES = 500;

function cacheKey(text: string, mode: string, model: string): string {
  return createHash('sha256').update(`${text}\0${mode}\0${model}`).digest('hex').slice(0, 16);
}

export function get(store: vscode.Memento, text: string, mode: string, model: string): string | undefined {
  return store.get<Record<string, string>>(STORE_KEY, {})[cacheKey(text, mode, model)];
}

export async function set(
  store: vscode.Memento, text: string, mode: string, model: string, explanation: string,
): Promise<void> {
  const cache = store.get<Record<string, string>>(STORE_KEY, {});
  const entries = Object.keys(cache);

  // Evict oldest half when full (simple FIFO approximation)
  const pruned = entries.length >= MAX_ENTRIES
    ? Object.fromEntries(entries.slice(entries.length / 2).map(k => [k, cache[k]]))
    : cache;

  pruned[cacheKey(text, mode, model)] = explanation;
  await store.update(STORE_KEY, pruned);
}
