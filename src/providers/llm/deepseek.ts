import * as openai from '@livekit/agents-plugin-openai';
import type { AppConfig } from '../../config/schema.js';

export function createDeepSeekLLM(config: AppConfig['llm']): openai.LLM {
  return openai.LLM.withDeepSeek({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    model: config.model,
    temperature: 0.5,
  });
}
