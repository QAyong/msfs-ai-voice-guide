import { defineAgent, llm, voice } from '@livekit/agents';
import { guideSourcesTopic } from '../../shared/guide-events.js';
import {
  guideVoiceAttributes,
  guideVoiceRpc,
  guideTurnDetection,
  type VoiceInputMode,
} from '../../shared/voice-control.js';
import { loadConfig } from '../config/schema.js';
import { createGuideInstructions } from '../conversation/guide-instructions.js';
import { MsfsCliClient } from '../msfs/cli-client.js';
import { MsfsGuideService } from '../msfs/guide-service.js';
import { resolveMsfsCliPath } from '../msfs/path.js';
import { readinessAttributes } from '../msfs/types.js';
import { createVoiceProviders } from '../providers/registry.js';
import { SearchService } from '../search/service.js';
import { createMsfsGuideTools } from '../tools/msfs-guide.js';
import { createSearchWebTool } from '../tools/search-web.js';
import { extractGuideSources } from './search-source-events.js';

export function createGuideAgent(tools: readonly llm.ToolContextEntry[] = []): voice.Agent {
  return new voice.Agent({ instructions: createGuideInstructions(), tools });
}

export function composeGuideTools(
  msfsTools: readonly llm.ToolContextEntry[],
  searchTool?: llm.ToolContextEntry,
): readonly llm.ToolContextEntry[] {
  return [...msfsTools, ...(searchTool ? [searchTool] : [])];
}

export default defineAgent({
  entry: async (ctx) => {
    const config = loadConfig();
    const providers = createVoiceProviders(config);
    const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
    const msfsService = new MsfsGuideService(
      new MsfsCliClient({
        executablePath: resolveMsfsCliPath({
          ...(config.msfs.cliPath ? { configuredPath: config.msfs.cliPath } : {}),
          ...(resourcesPath ? { resourcesPath } : {}),
        }),
        timeoutMs: config.msfs.timeoutMs,
        maxConcurrency: config.msfs.maxConcurrency,
        onDiagnostic: (event) => {
          console.warn(`[msfs-cli] ${JSON.stringify(event)}`);
        },
      }),
      {
        trackIntervalMs: config.msfs.trackIntervalMs,
        trackMaximumPoints: config.msfs.trackMaximumPoints,
      },
    );
    ctx.addShutdownCallback(() => msfsService.close());
    const session = new voice.AgentSession({
      stt: providers.stt,
      llm: providers.llm,
      tts: providers.tts,
      turnHandling: { interruption: { enabled: true, mode: 'vad' } },
    });
    await ctx.connect();
    const participant = ctx.room.localParticipant;
    let inputMode: VoiceInputMode = 'push_to_talk';
    const publishVoiceAttributes = (attributes: Record<string, string>) => {
      if (!participant) return;
      void participant.setAttributes(attributes).catch(() => undefined);
    };
    const setInputMode = (nextMode: VoiceInputMode) => {
      inputMode = nextMode;
      publishVoiceAttributes({ [guideVoiceAttributes.inputMode]: nextMode });
    };
    void msfsService
      .warmup()
      .then((readiness) => {
        publishVoiceAttributes(readinessAttributes(readiness));
      })
      .catch(() =>
        publishVoiceAttributes(
          readinessAttributes({
            status: 'cli_unavailable',
            message: 'MSFS CLI 暂时不可用。',
            code: 'MSFS_CLI_UNAVAILABLE',
            timestamp: new Date().toISOString(),
          }),
        ),
      );

    session.on(voice.AgentSessionEventTypes.UserStateChanged, (event) => {
      publishVoiceAttributes({ [guideVoiceAttributes.userState]: event.newState });
    });
    participant?.registerRpcMethod(guideVoiceRpc.startTurn, async () => {
      session.updateOptions({
        turnHandling: { turnDetection: guideTurnDetection.pushToTalk },
      });
      session.interrupt();
      session.clearUserTurn();
      session.input.setAudioEnabled(true);
      setInputMode('push_to_talk');
      return 'ok';
    });
    participant?.registerRpcMethod(guideVoiceRpc.endTurn, async () => {
      session.input.setAudioEnabled(false);
      session.commitUserTurn();
      return 'ok';
    });
    participant?.registerRpcMethod(guideVoiceRpc.cancelTurn, async () => {
      session.input.setAudioEnabled(false);
      session.clearUserTurn();
      return 'ok';
    });
    participant?.registerRpcMethod(guideVoiceRpc.startContinuous, async () => {
      session.updateOptions({
        turnHandling: { turnDetection: guideTurnDetection.continuous },
      });
      session.input.setAudioEnabled(true);
      setInputMode('continuous');
      return 'ok';
    });
    participant?.registerRpcMethod(guideVoiceRpc.stopContinuous, async () => {
      session.input.setAudioEnabled(false);
      session.updateOptions({
        turnHandling: { turnDetection: guideTurnDetection.pushToTalk },
      });
      setInputMode('push_to_talk');
      return 'ok';
    });
    participant?.registerRpcMethod(guideVoiceRpc.suspendVoice, async () => {
      session.input.setAudioEnabled(false);
      session.output.setAudioEnabled(false);
      session.clearUserTurn();
      await session.interrupt({ force: true }).await;
      return 'ok';
    });
    participant?.registerRpcMethod(guideVoiceRpc.resumeVoice, async () => {
      await session.interrupt({ force: true }).await;
      session.input.setAudioEnabled(false);
      session.output.setAudioEnabled(true);
      return 'ok';
    });
    session.on(voice.AgentSessionEventTypes.FunctionToolsExecuted, (event) => {
      const message = extractGuideSources(event);
      if (!message || !participant) return;
      void participant
        .publishData(new TextEncoder().encode(JSON.stringify(message)), {
          reliable: true,
          topic: guideSourcesTopic,
        })
        .catch(() => undefined);
    });
    const searchTool = config.search.apiKey
      ? createSearchWebTool(
          new SearchService({
            apiKey: config.search.apiKey,
            endpoint: config.search.endpoint,
            timeoutMs: config.search.timeoutMs,
          }),
        )
      : undefined;
    const tools = composeGuideTools(createMsfsGuideTools(msfsService), searchTool);

    await session.start({
      room: ctx.room,
      agent: createGuideAgent(tools),
    });
    session.input.setAudioEnabled(false);
    publishVoiceAttributes({
      [guideVoiceAttributes.inputMode]: inputMode,
      [guideVoiceAttributes.userState]: session.userState,
    });
  },
});
