import type { Chunk } from '../chunking';
import type { Mode } from '../rules';

export type { Mode };

export interface ChunkRequest extends Chunk {
  /** Stable index within the current chunk array; used to match responses. */
  id: number;
  /** Definitions and file-header context assembled by context.ts. */
  context?: string;
}

export interface LlmProvider {
  explain(chunks: ChunkRequest[], mode: Mode, signal: AbortSignal): Promise<Map<number, string>>;
}
