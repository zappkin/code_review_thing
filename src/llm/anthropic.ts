import type { LlmProvider, ChunkRequest, Mode } from './provider';
import { buildMessages, parseResponse } from './prompt';

interface AnthropicResponse {
  content: { type: string; text: string }[];
}

export class AnthropicProvider implements LlmProvider {
  constructor(
    private readonly model: string,
    private readonly apiKey: string,
  ) {}

  async explain(chunks: ChunkRequest[], mode: Mode, signal: AbortSignal): Promise<Map<number, string>> {
    const { system, user } = buildMessages(chunks, mode);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        system,
        messages: [{ role: 'user', content: user }],
        max_tokens: 4096,
      }),
      signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}${body ? ': ' + body : ''}`);
    }

    const data = await res.json() as AnthropicResponse;
    const text = data.content.find(b => b.type === 'text')?.text ?? '';
    return parseResponse(text);
  }
}
