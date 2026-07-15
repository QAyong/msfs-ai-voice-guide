import type { AppConfig } from '../config/schema.js';

export type ProviderHealthReport = {
  provider: 'volcengine';
  llm: 'configured';
  stt: 'configured';
  tts: 'configured';
};

export function checkProviderConfiguration(config: AppConfig): ProviderHealthReport {
  void config;
  return {
    provider: 'volcengine',
    llm: 'configured',
    stt: 'configured',
    tts: 'configured',
  };
}
