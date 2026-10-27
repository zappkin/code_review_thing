import * as vscode from 'vscode';
import type { Chunk } from './chunking';
import type { LlmConfig } from './config';
import { getApiKey } from './config';
import type { Mode } from './rules';
import { ruleBasedExplain } from './rules';
import type { LlmProvider } from './llm/provider';
import { OpenAiCompatProvider } from './llm/openai';
import { AnthropicProvider } from './llm/anthropic';
import * as cache from './cache';
import { ensureConsent, redact } from './safety';
import { gatherContext } from './context';

export interface ChunkResult {
  text: string;
  stale: boolean;
  error?: string;
}

const PREFETCH_AHEAD = 3;

/**
 * Orchestrates the explain pipeline:
 *   1. Rule-based text immediately for all chunks.
 *   2. Cache hits fill in instantly.
 *   3. Uncached visible/prefetch chunks are batched to the LLM.
 *   4. LLM results are written to cache and reported via onUpdate.
 */
export class Explainer {
  private controller: AbortController | undefined;

  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly globalState: vscode.Memento,
    private readonly workspaceState: vscode.Memento,
  ) {}

  cancel(): void {
    this.controller?.abort();
    this.controller = undefined;
  }

  async explain(
    doc: vscode.TextDocument,
    chunks: Chunk[],
    visibleIndices: number[],
    mode: Mode,
    cfg: LlmConfig,
    onUpdate: (index: number, result: ChunkResult) => void,
  ): Promise<ChunkResult[]> {
    // Start with rule-based text for every chunk.
    const results: ChunkResult[] = chunks.map(c => ({
      text: ruleBasedExplain(c, mode),
      stale: false,
    }));

    // Determine which indices to fetch: visible + N ahead, deduplicated.
    const fetchSet = new Set([
      ...visibleIndices,
      ...visibleIndices.flatMap(i => [i + 1, i + 2, i + 3].slice(0, PREFETCH_AHEAD)),
    ].filter(i => i >= 0 && i < chunks.length));

    // Apply cache hits immediately.
    for (const i of fetchSet) {
      const cached = cache.get(this.workspaceState, chunks[i].text, mode, cfg.model);
      if (cached) results[i] = { text: cached, stale: false };
    }

    const uncached = [...fetchSet].filter(
      i => !cache.get(this.workspaceState, chunks[i].text, mode, cfg.model),
    );
    if (!uncached.length) return results;

    // Gate on user consent before sending code to the provider.
    const consented = await ensureConsent(this.globalState, cfg.provider, cfg.baseUrl);
    if (!consented) return results;

    const apiKey = await getApiKey(this.secrets, cfg.provider);
    const provider = buildProvider(cfg, apiKey);

    this.controller?.abort();
    this.controller = new AbortController();
    const { signal } = this.controller;

    // Gather context for each uncached chunk concurrently.
    const requests = await Promise.all(
      uncached.map(async i => ({
        ...chunks[i],
        text: redact(chunks[i].text),
        id: i,
        context: await gatherContext(doc, chunks[i]),
      })),
    );

    try {
      const explanations = await provider.explain(requests, mode, signal);
      for (const [id, text] of explanations) {
        results[id] = { text, stale: false };
        await cache.set(this.workspaceState, chunks[id].text, mode, cfg.model, text);
        onUpdate(id, results[id]);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return results;
      const error = friendlyError(err);
      for (const i of uncached) {
        results[i] = { ...results[i], error };
        onUpdate(i, results[i]);
      }
    }

    return results;
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function buildProvider(cfg: LlmConfig, apiKey: string): LlmProvider {
  return cfg.provider === 'anthropic'
    ? new AnthropicProvider(cfg.model, apiKey)
    : new OpenAiCompatProvider(cfg.baseUrl, cfg.model, apiKey);
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('401')) return 'Invalid API key — run "Code Lyrics: Set API Key".';
  if (msg.includes('429')) return 'Rate limited. Try again in a moment.';
  if (/fetch|ECONNREFUSED|network/i.test(msg)) return 'Cannot reach the LLM server. Is it running?';
  return msg;
}
