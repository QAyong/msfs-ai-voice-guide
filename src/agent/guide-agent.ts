import { defineAgent, llm, voice } from '@livekit/agents';
import { guideSourcesTopic } from '../../shared/guide-events.js';
import { loadConfig } from '../config/schema.js';
import { createGuideInstructions } from '../conversation/guide-instructions.js';
import { createVoiceProviders } from '../providers/registry.js';
import { SearchService } from '../search/service.js';
import { createSearchWebTool } from '../tools/search-web.js';
import { extractGuideSources } from './search-source-events.js';

export function createGuideAgent(tools: readonly llm.ToolContextEntry[] = []): voice.Agent {
  return new voice.Agent({ instructions: createGuideInstructions(), tools });
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
    session.on(voice.AgentSessionEventTypes.FunctionToolsExecuted, (event) => {
      const message = extractGuideSources(event);
      const participant = ctx.room.localParticipant;
      if (!message || !participant) return;
      void participant
        .publishData(new TextEncoder().encode(JSON.stringify(message)), {
          reliable: true,
          topic: guideSourcesTopic,
        })
        .catch(() => undefined);
    });
    const tools = config.search.apiKey
      ? [
          createSearchWebTool(
            new SearchService({
              apiKey: config.search.apiKey,
              endpoint: config.search.endpoint,
              timeoutMs: config.search.timeoutMs,
            }),
          ),
        ]
      : [];

    await session.start({ room: ctx.room, agent: createGuideAgent(tools) });
  },
});
