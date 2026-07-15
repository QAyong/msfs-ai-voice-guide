import { type llm, type stt, type tts } from '@livekit/agents';
import type { AppConfig } from '../config/schema.js';
import { createDeepSeekLLM } from './llm/deepseek.js';
import { VolcengineSTT } from './stt/volcengine.js';
import { VolcengineTTS } from './tts/volcengine.js';

export type VoiceProviders = {
  llm: llm.LLM;
  stt: stt.STT;
  tts: tts.TTS;
};

export function createVoiceProviders(config: AppConfig): VoiceProviders {
  return {
    llm: createDeepSeekLLM(config.llm),
    stt: new VolcengineSTT(config.volcengine.stt),
    tts: new VolcengineTTS(config.volcengine.tts),
  };
}
