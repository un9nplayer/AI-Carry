import { request } from 'undici';
import type { Message, GenOptions, GenerateResult, StreamChunk, ModelAdapter } from '../types.js';

export class OpenAICompatibleAdapter implements ModelAdapter {
  protected apiKey: string;
  protected endpoint: string;
  protected modelName: string;
  protected costPer1KInput: number;
  protected costPer1KOutput: number;
  protected contextLength: number;

  constructor(
    apiKey: string,
    modelName = 'gpt-4o-mini',
    endpoint = 'https://api.openai.com/v1',
    costPer1KInput = 0.00015,
    costPer1KOutput = 0.0006,
    contextLength = 128000
  ) {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.endpoint = endpoint;
    this.costPer1KInput = costPer1KInput;
    this.costPer1KOutput = costPer1KOutput;
    this.contextLength = contextLength;
  }

  protected getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async generate(messages: Message[], opts?: GenOptions): Promise<GenerateResult> {
    const res = await request(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.modelName,
        messages,
        temperature: opts?.temperature ?? 0.7,
        max_tokens: opts?.maxTokens ?? 2048,
        stream: false,
      }),
    });

    if (res.statusCode !== 200) {
      const errText = await res.body.text();
      throw new Error(`API Error (${res.statusCode}): ${errText}`);
    }

    const data = (await res.body.json()) as any;
    const content = data.choices?.[0]?.message?.content || '';
    const tokensIn = data.usage?.prompt_tokens ?? 0;
    const tokensOut = data.usage?.completion_tokens ?? 0;
    const cost = this.estimateCost(tokensIn, tokensOut);

    return { content, tokensIn, tokensOut, cost };
  }

  async *stream(messages: Message[], opts?: GenOptions): AsyncGenerator<StreamChunk, void, unknown> {
    const res = await request(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.modelName,
        messages,
        temperature: opts?.temperature ?? 0.7,
        max_tokens: opts?.maxTokens ?? 2048,
        stream: true,
      }),
    });

    if (res.statusCode !== 200) {
      const errText = await res.body.text();
      throw new Error(`API Error (${res.statusCode}): ${errText}`);
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
          const text = parsed.choices?.[0]?.delta?.content || '';
          if (text) {
            yield { content: text };
          }
        } catch {
          // Ignore partial chunk parse errors
        }
      }
    }
  }

  async countTokens(messages: Message[]): Promise<number> {
    // Simple heuristic fallback (approx. 4 characters per token)
    const text = messages.map((m) => m.content).join(' ');
    return Math.ceil(text.length / 4);
  }

  supportsVision(): boolean {
    return false;
  }

  supportsReasoning(): boolean {
    return false;
  }

  supportsTools(): boolean {
    return true;
  }

  supportsImages(): boolean {
    return false;
  }

  getContextLength(): number {
    return this.contextLength;
  }

  estimateCost(tokensIn: number, tokensOut: number): number {
    return (tokensIn / 1000) * this.costPer1KInput + (tokensOut / 1000) * this.costPer1KOutput;
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await request(`${this.endpoint}/models`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (res.statusCode !== 200) return [];
      const data = (await res.body.json()) as any;
      return data.data?.map((m: any) => m.id) || [];
    } catch {
      return [];
    }
  }
}
