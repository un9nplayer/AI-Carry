import { OpenAICompatibleAdapter } from './openai.js';

export class NvidiaAdapter extends OpenAICompatibleAdapter {
  constructor(apiKey: string, modelName = 'meta/llama3-70b-instruct') {
    const cleanModel = modelName.toLowerCase().startsWith('nvidia/') ? modelName.slice(7) : modelName;
    super(apiKey, cleanModel, 'https://integrate.api.nvidia.com/v1', 0.0007, 0.0009, 8192);
  }
}
