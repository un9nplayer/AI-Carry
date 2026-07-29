export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface GenOptions {
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
}

export interface StreamChunk {
  content: string;
  tokensIn?: number;
  tokensOut?: number;
  cost?: number;
}

export interface GenerateResult {
  content: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

export interface ModelAdapter {
  generate(messages: Message[], opts?: GenOptions): Promise<GenerateResult>;
  stream(messages: Message[], opts?: GenOptions): AsyncGenerator<StreamChunk, void, unknown>;
  countTokens(messages: Message[]): Promise<number>;
  supportsVision(): boolean;
  supportsReasoning(): boolean;
  supportsTools(): boolean;
  supportsImages(): boolean;
  getContextLength(): number;
  estimateCost(tokensIn: number, tokensOut: number): number;
  listModels(): Promise<string[]>;
}
