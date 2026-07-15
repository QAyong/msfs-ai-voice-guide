import * as openai from '@livekit/agents-plugin-openai';
import type { AppConfig } from '../../config/schema.js';

export function createVolcengineLLM(config: AppConfig['volcengine']['llm']): openai.LLM {
  return new openai.LLM({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    model: config.model,
    temperature: 0.5,
  });
}
