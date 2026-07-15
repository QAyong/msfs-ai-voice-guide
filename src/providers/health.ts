import type { AppConfig } from '../config/schema.js';

export type ProviderHealthReport = {
  llm: 'deepseek';
  stt: 'volcengine';
  tts: 'volcengine';
};

export function checkProviderConfiguration(config: AppConfig): ProviderHealthReport {
  void config;
  return {
    llm: 'deepseek',
    stt: 'volcengine',
    tts: 'volcengine',
  };
}
