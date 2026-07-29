import pRetry from 'p-retry';
import crypto from 'node:crypto';
import { getApiKeys, getConfig, updateConfig } from '../config/index.js';
import { getDb } from '../sessions/db.js';
import type { Message, GenOptions, GenerateResult, StreamChunk, ModelAdapter } from './types.js';
import { OpenAICompatibleAdapter } from './adapters/openai.js';
import { GeminiAdapter } from './adapters/gemini.js';
import { AnthropicAdapter } from './adapters/anthropic.js';
import { OllamaAdapter } from './adapters/ollama.js';
import { OpenRouterAdapter } from './adapters/openrouter.js';
import { NvidiaAdapter } from './adapters/nvidia.js';

export class ModelManager {
  private activeModel: string;
  private activeProvider: string;
  private adapter!: ModelAdapter;

  constructor() {
    const config = getConfig();
    this.activeModel = config.defaultModel;
    this.activeProvider = this.detectProvider(this.activeModel);
    this.loadAdapter();
  }

  public getActiveModel(): string {
    return this.activeModel;
  }

  public getActiveProvider(): string {
    return this.activeProvider;
  }

  public setModel(modelName: string): void {
    this.activeModel = modelName;
    this.activeProvider = this.detectProvider(modelName);
    this.loadAdapter();
    try {
      updateConfig({ defaultModel: modelName });
    } catch {
      // Fail silently if config is not fully loaded/initialized (e.g., in unit tests)
    }
  }

  private detectProvider(modelName: string): string {
    const name = modelName.toLowerCase();
    if (name.includes('openrouter')) return 'openrouter';
    if (name.includes('nvidia') || name.includes('nim')) return 'nvidia';
    if (name.includes('ollama') || name.startsWith('ollama/')) return 'ollama';
    if (name.includes('gemini')) return 'gemini';
    if (name.includes('claude') || name.includes('anthropic')) return 'anthropic';
    if (name.includes('gpt') || name.includes('openai')) return 'openai';
    if (name.includes('mistral') || name.includes('phi3') || name.includes('llama3')) return 'ollama';
    return 'openai'; // Fallback default
  }

  private loadAdapter(): void {
    const keys = getApiKeys();
    switch (this.activeProvider) {
      case 'gemini':
        this.adapter = new GeminiAdapter(keys.gemini || 'mock-key', this.activeModel);
        break;
      case 'anthropic':
        this.adapter = new AnthropicAdapter(keys.anthropic || 'mock-key', this.activeModel);
        break;
      case 'ollama':
        this.adapter = new OllamaAdapter(keys.ollama || 'http://127.0.0.1:11434/v1', this.activeModel);
        break;
      case 'openrouter':
        this.adapter = new OpenRouterAdapter(keys.openrouter || 'mock-key', this.activeModel);
        break;
      case 'nvidia':
        this.adapter = new NvidiaAdapter(keys.nvidia || 'mock-key', this.activeModel);
        break;
      case 'openai':
      default:
        this.adapter = new OpenAICompatibleAdapter(keys.openai || 'mock-key', this.activeModel);
        break;
    }
  }

  private logUsage(tokensIn: number, tokensOut: number, cost: number, latencyMs: number): void {
    try {
      const db = getDb();
      const insertLog = db.prepare(`
        INSERT INTO api_logs (id, provider, model, tokens_in, tokens_out, cost, latency_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertLog.run(
        crypto.randomUUID(),
        this.activeProvider,
        this.activeModel,
        tokensIn,
        tokensOut,
        cost,
        latencyMs,
        Date.now()
      );
    } catch {
      // Fail silently if DB not connected (e.g. in standalone tests)
    }
  }

  async generate(messages: Message[], opts?: GenOptions): Promise<GenerateResult> {
    const startTime = Date.now();
    const config = getConfig();

    const runCall = async () => {
      return await this.adapter.generate(messages, opts);
    };

    try {
      const result = await pRetry(runCall, {
        retries: config.retryCount ?? 3,
      });

      const latency = Date.now() - startTime;
      this.logUsage(result.tokensIn, result.tokensOut, result.cost, latency);
      return result;
    } catch (err) {
      throw err;
    }
  }

  async *stream(messages: Message[], opts?: GenOptions): AsyncGenerator<StreamChunk, void, unknown> {
    const startTime = Date.now();
    const config = getConfig();

    const getStream = async () => {
      return this.adapter.stream(messages, opts);
    };

    try {
      const generator = await pRetry(getStream, {
        retries: config.retryCount ?? 3,
      });

      let totalIn = 0;
      let totalOut = 0;

      for await (const chunk of generator) {
        totalIn = chunk.tokensIn || totalIn;
        totalOut = chunk.tokensOut || totalOut;
        yield chunk;
      }

      const latency = Date.now() - startTime;
      const tokensIn = totalIn || (await this.adapter.countTokens(messages));
      // Estimate simple word/char count for out tokens if not provided
      const tokensOut = totalOut || 150; 
      const cost = this.adapter.estimateCost(tokensIn, tokensOut);
      this.logUsage(tokensIn, tokensOut, cost, latency);
    } catch (err) {
      throw err;
    }
  }

  async countTokens(messages: Message[]): Promise<number> {
    return await this.adapter.countTokens(messages);
  }

  supportsVision(): boolean { return this.adapter.supportsVision(); }
  supportsReasoning(): boolean { return this.adapter.supportsReasoning(); }
  supportsTools(): boolean { return this.adapter.supportsTools(); }
  supportsImages(): boolean { return this.adapter.supportsImages(); }
  getContextLength(): number { return this.adapter.getContextLength(); }
  async listModels(): Promise<string[]> {
    return await this.adapter.listModels();
  }

  public async listAllProviderModels(): Promise<{ provider: string; models: string[] }[]> {
    const keys = getApiKeys();
    const providers = ['nvidia', 'gemini', 'openai', 'anthropic', 'openrouter', 'ollama'];
    const results: { provider: string; models: string[] }[] = [];

    const isPlaceholderKey = (key: string | undefined): boolean => {
      if (!key) return true;
      const lower = key.toLowerCase();
      return (
        lower.includes('placeholder') ||
        lower.includes('your-') ||
        lower.includes('mock-') ||
        lower === 'your-openai-api-key' ||
        lower === 'your-gemini-api-key' ||
        lower === 'your-anthropic-api-key' ||
        lower === 'your-openrouter-key'
      );
    };

    for (const provider of providers) {
      const key = keys[provider as keyof typeof keys];
      
      // Skip Ollama if not explicitly configured in env
      if (provider === 'ollama' && !process.env.OLLAMA_HOST) {
        continue;
      }
      
      // Skip other providers if key is placeholder or missing
      if (provider !== 'ollama' && isPlaceholderKey(key)) {
        continue;
      }

      try {
        let adapter: ModelAdapter;
        switch (provider) {
          case 'gemini':
            adapter = new GeminiAdapter(key, 'gemini-2.5-pro');
            break;
          case 'anthropic':
            adapter = new AnthropicAdapter(key, 'claude-3-5-sonnet');
            break;
          case 'ollama':
            adapter = new OllamaAdapter(key || 'http://127.0.0.1:11434/v1', 'ollama/llama3');
            break;
          case 'openrouter':
            adapter = new OpenRouterAdapter(key, 'openrouter/meta-llama/llama-3-8b-instruct:free');
            break;
          case 'nvidia':
            adapter = new NvidiaAdapter(key, 'meta/llama3-70b-instruct');
            break;
          case 'openai':
          default:
            adapter = new OpenAICompatibleAdapter(key, 'gpt-4o-mini');
            break;
        }

        const models = await adapter.listModels();
        if (models && models.length > 0) {
          const formattedModels = models.map(m => {
            if (provider === 'gemini' || provider === 'openai' || provider === 'anthropic') {
              return m;
            }
            return `${provider}/${m}`;
          });
          results.push({ provider, models: formattedModels });
        }
      } catch (err) {
        // Fail silently for this provider
      }
    }

    if (results.length === 0) {
      results.push({
        provider: 'fallback',
        models: [
          'gemini-2.5-pro',
          'gemini-2.5-flash',
          'gpt-4o',
          'gpt-4o-mini',
          'claude-3-5-sonnet',
          'claude-3-opus'
        ]
      });
    }

    return results;
  }
}
