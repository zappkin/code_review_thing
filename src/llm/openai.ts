import type { LlmProvider, ChunkRequest, Mode } from './provider';
import { buildMessages, parseResponse } from './prompt';

interface OpenAiResponse {
  choices: { message: { content: string } }[];
}

/**
 * Adapter for any OpenAI-compatible HTTP API:
 * OpenAI, Groq, OpenRouter, DeepSeek, Together, Ollama, LM Studio, etc.
 * Ollama: baseUrl = "http://localhost:11434/v1", apiKey = "" (omit header).
 */
export class OpenAiCompatProvider implements LlmProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly apiKey: string,
  ) {}

  async explain(chunks: ChunkRequest[], mode: Mode, signal: AbortSignal): Promise<Map<number, string>> {
    const { system, user } = buildMessages(chunks, mode);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: user },
        ],
        temperature: 0.3,
      }),
      signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}${body ? ': ' + body : ''}`);
    }

    const data = await res.json() as OpenAiResponse;
    return parseResponse(data.choices[0]?.message?.content ?? '');
  }
}
