import { request } from 'undici';
import type { Message, GenOptions, GenerateResult, StreamChunk, ModelAdapter } from '../types.js';

export class AnthropicAdapter implements ModelAdapter {
  private apiKey: string;
  private modelName: string;

  constructor(apiKey: string, modelName = 'claude-3-5-sonnet-20241022') {
    this.apiKey = apiKey;
    this.modelName = modelName;
  }

  private mapMessages(messages: Message[]) {
    // Anthropic separates system prompt
    const system = messages.find((m) => m.role === 'system')?.content;
    const filtered = messages.filter((m) => m.role !== 'system');
    return {
      system,
      messages: filtered.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    };
  }

  async generate(messages: Message[], opts?: GenOptions): Promise<GenerateResult> {
    const { system, messages: mappedMessages } = this.mapMessages(messages);
    const res = await request('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.modelName,
        system,
        messages: mappedMessages,
        max_tokens: opts?.maxTokens ?? 2048,
        temperature: opts?.temperature ?? 0.7,
      }),
    });

    if (res.statusCode !== 200) {
      const errText = await res.body.text();
      throw new Error(`Anthropic API Error (${res.statusCode}): ${errText}`);
    }

    const data = (await res.body.json()) as any;
    const content = data.content?.[0]?.text || '';
    const tokensIn = data.usage?.input_tokens ?? 0;
    const tokensOut = data.usage?.output_tokens ?? 0;
    const cost = this.estimateCost(tokensIn, tokensOut);

    return { content, tokensIn, tokensOut, cost };
  }

  async *stream(messages: Message[], opts?: GenOptions): AsyncGenerator<StreamChunk, void, unknown> {
    const { system, messages: mappedMessages } = this.mapMessages(messages);
    const res = await request('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.modelName,
        system,
        messages: mappedMessages,
        max_tokens: opts?.maxTokens ?? 2048,
        temperature: opts?.temperature ?? 0.7,
        stream: true,
      }),
    });

    if (res.statusCode !== 200) {
      const errText = await res.body.text();
      throw new Error(`Anthropic API Error (${res.statusCode}): ${errText}`);
    }

    const body = res.body;
    let buffer = '';

    for await (const chunk of body) {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const cleaned = line.trim();
        if (!cleaned || !cleaned.startsWith('data: ')) continue;
        const dataStr = cleaned.slice(6);
        if (dataStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            yield { content: parsed.delta.text };
          }
        } catch {
          // Ignore partial chunk parse errors
        }
      }
    }
  }

  async countTokens(messages: Message[]): Promise<number> {
    const text = messages.map((m) => m.content).join(' ');
    return Math.ceil(text.length / 4);
  }

  supportsVision(): boolean {
    return true;
  }

  supportsReasoning(): boolean {
    return false;
  }

  supportsTools(): boolean {
    return true;
  }

  supportsImages(): boolean {
    return true;
  }

  getContextLength(): number {
    return 200000;
  }

  estimateCost(tokensIn: number, tokensOut: number): number {
    // Claude 3.5 Sonnet pricing: $3 per M input, $15 per M output
    return (tokensIn / 1000000) * 3.0 + (tokensOut / 1000000) * 15.0;
  }

  async listModels(): Promise<string[]> {
    return [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ];
  }
}
