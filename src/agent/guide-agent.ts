import { defineAgent, voice } from '@livekit/agents';
import { loadConfig } from '../config/schema.js';
import { createGuideInstructions } from '../conversation/guide-instructions.js';
import { createVoiceProviders } from '../providers/registry.js';

export function createGuideAgent(): voice.Agent {
  return new voice.Agent({ instructions: createGuideInstructions() });
}

export default defineAgent({
  entry: async (ctx) => {
    const config = loadConfig();
    const providers = createVoiceProviders(config);
    const session = new voice.AgentSession({
      stt: providers.stt,
      llm: providers.llm,
      tts: providers.tts,
    });

    await ctx.connect();
    await session.start({ room: ctx.room, agent: createGuideAgent() });
  },
});
