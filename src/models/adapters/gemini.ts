import { request } from 'undici';
import type { Message, GenOptions, GenerateResult, StreamChunk, ModelAdapter } from '../types.js';

export class GeminiAdapter implements ModelAdapter {
  private apiKey: string;
  private modelName: string;

  constructor(apiKey: string, modelName = 'gemini-2.5-pro') {
    this.apiKey = apiKey;
    this.modelName = modelName;
  }

  private mapMessages(messages: Message[]) {
    return messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  }

  async generate(messages: Message[], opts?: GenOptions): Promise<GenerateResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;
    const res = await request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: this.mapMessages(messages),
        generationConfig: {
          temperature: opts?.temperature ?? 0.7,
          maxOutputTokens: opts?.maxTokens ?? 4096,
        },
      }),
    });

    if (res.statusCode !== 200) {
      const errText = await res.body.text();
      throw new Error(`Gemini API Error (${res.statusCode}): ${errText}`);
    }

    const data = (await res.body.json()) as any;
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Gemini 2.5 counts
    const tokensIn = data.usageMetadata?.promptTokenCount ?? 0;
    const tokensOut = data.usageMetadata?.candidatesTokenCount ?? 0;
    const cost = this.estimateCost(tokensIn, tokensOut);

    return { content, tokensIn, tokensOut, cost };
  }

  async *stream(messages: Message[], opts?: GenOptions): AsyncGenerator<StreamChunk, void, unknown> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:streamGenerateContent?key=${this.apiKey}`;
    const res = await request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: this.mapMessages(messages),
        generationConfig: {
          temperature: opts?.temperature ?? 0.7,
          maxOutputTokens: opts?.maxTokens ?? 4096,
        },
      }),
    });

    if (res.statusCode !== 200) {
      const errText = await res.body.text();
      throw new Error(`Gemini API Error (${res.statusCode}): ${errText}`);
    }

    const body = res.body;
    let buffer = '';

    for await (const chunk of body) {
      buffer += chunk.toString('utf8');
      
      // Gemini returns JSON array or JSON objects as stream. Let's parse JSON lines or stream blocks safely.
      // Often, the streaming endpoint returns a JSON array structure: [ { "candidates": ... }, ... ]
      // We can extract text parts inside regex or string searches if full parse fails.
      let match;
      // Extract text content using regex to avoid complex JSON parsing of streaming blocks which can span multiple chunks
      const regex = /"text":\s*"((?:[^"\\]|\\.)*)"/g;
      while ((match = regex.exec(buffer)) !== null) {
        // Simple JSON escape decoder
        try {
          const parsedText = JSON.parse(`"${match[1]}"`);
          if (parsedText) {
            yield { content: parsedText };
          }
        } catch {
          // Ignore parse errors
        }
      }
      // Flush buffer if it grows too big to avoid memory leaks
      if (buffer.length > 50000) {
        buffer = '';
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
    return true;
  }

  supportsTools(): boolean {
    return true;
  }

  supportsImages(): boolean {
    return true;
  }

  getContextLength(): number {
    return 1000000; // 1M+ context length
  }

  estimateCost(tokensIn: number, tokensOut: number): number {
    // Gemini 2.5 Flash is highly cost-effective (approx $0.075 / 1M input tokens)
    return (tokensIn / 1000000) * 0.075 + (tokensOut / 1000000) * 0.3;
  }

  async listModels(): Promise<string[]> {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`;
      const res = await request(url, { method: 'GET' });
      if (res.statusCode !== 200) return [];
      const data = (await res.body.json()) as any;
      return data.models?.map((m: any) => m.name.replace('models/', '')) || [];
    } catch {
      return [];
    }
  }
}
