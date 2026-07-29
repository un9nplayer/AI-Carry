import { OpenAICompatibleAdapter } from './openai.js';

export class OllamaAdapter extends OpenAICompatibleAdapter {
  constructor(endpoint = 'http://127.0.0.1:11434/v1', modelName = 'llama3') {
    // Ollama does not require real API key, so we use dummy "ollama"
    super('ollama', modelName, endpoint, 0, 0, 8192);
  }

  override estimateCost(_tokensIn: number, _tokensOut: number): number {
    return 0.0; // Local model is free
  }

  override async listModels(): Promise<string[]> {
    try {
      // Query local Ollama tag list endpoint
      const baseUrl = this.endpoint.replace('/v1', '');
      const res = await fetch(`${baseUrl}/api/tags`);
      if (res.status !== 200) return [];
      const data = (await res.json()) as any;
      return data.models?.map((m: any) => m.name) || [];
    } catch {
      return [];
    }
  }
}
