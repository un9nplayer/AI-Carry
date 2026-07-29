import { OpenAICompatibleAdapter } from './openai.js';

export class OpenRouterAdapter extends OpenAICompatibleAdapter {
  constructor(apiKey: string, modelName = 'meta-llama/llama-3-8b-instruct:free') {
    super(apiKey, modelName, 'https://openrouter.ai/api/v1', 0.0001, 0.0002, 16384);
  }

  protected override getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      'HTTP-Referer': 'https://github.com/google-deepmind/antigravity',
      'X-Title': 'AICarry CLI',
    };
  }
}
