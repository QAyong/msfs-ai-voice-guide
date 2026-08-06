import { defineAgent, llm, voice } from '@livekit/agents';
import { join } from 'node:path';
import {
  guideSourcesTopic,
  guideToolEventSchema,
  guideToolEventsTopic,
} from '../../shared/guide-events.js';
import {
  guideVoiceAttributes,
  guideVoiceRpc,
  guideTurnDetection,
  type VoiceInputMode,
} from '../../shared/voice-control.js';
import { loadConfig } from '../config/schema.js';
import { createGuideInstructions, type GuideLocale } from '../conversation/guide-instructions.js';
import { MsfsCliClient } from '../msfs/cli-client.js';
import { MsfsGuideService } from '../msfs/guide-service.js';
import { resolveMsfsCliPath } from '../msfs/path.js';
import { readinessAttributes } from '../msfs/types.js';
import { createVoiceProviders } from '../providers/registry.js';
import { SearchService } from '../search/service.js';
import { createMsfsGuideTools } from '../tools/msfs-guide.js';
import { createSearchWebTool } from '../tools/search-web.js';
import { extractGuideSources } from './search-source-events.js';
import { parseDesktopToolSettingsEnvironment } from '../../shared/desktop-settings.js';

export function createGuideAgent(
  tools: readonly llm.ToolContextEntry[] = [],
  locale: GuideLocale = 'zh-CN',
): voice.Agent {
  return new voice.Agent({ instructions: createGuideInstructions(locale), tools });
}

export function composeGuideTools(
  msfsTools: readonly llm.ToolContextEntry[],
  searchTool?: llm.ToolContextEntry,
): readonly llm.ToolContextEntry[] {
  return [...msfsTools, ...(searchTool ? [searchTool] : [])];
}

type ToolActivityObserver = {
  completed(toolName: string): void;
  started(toolName: string): void;
};

function isFunctionTool(tool: llm.ToolContextEntry): tool is llm.FunctionTool {
  return 'type' in tool && tool.type === 'function';
}

function observeToolActivity(
  tools: readonly llm.ToolContextEntry[],
  observer: ToolActivityObserver,
): readonly llm.ToolContextEntry[] {
  return tools.map((tool) => {
    if (!isFunctionTool(tool)) return tool;
    const execute = tool.execute;
    return {
      ...tool,
      execute: async (args, options) => {
        observer.started(tool.name);
        try {
          return await execute(args, options);
        } finally {
          observer.completed(tool.name);
        }
      },
    };
  });
}

export default defineAgent({
  entry: async (ctx) => {
    const config = loadConfig();
    const enabledTools = parseDesktopToolSettingsEnvironment(process.env.GUIDE_ENABLED_TOOLS);
    const locale: GuideLocale = process.env.GUIDE_LOCALE === 'en-US' ? 'en-US' : 'zh-CN';
    const providers = createVoiceProviders({
      ...config,
      volcengine: {
        ...config.volcengine,
        stt: {
          ...config.volcengine.stt,
          language: locale === 'en-US' ? 'en' : 'zh',
        },
      },
    });
    const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
    const msfsService = new MsfsGuideService(
      new MsfsCliClient({
        executablePath: resolveMsfsCliPath({
          ...(config.msfs.cliPath ? { configuredPath: config.msfs.cliPath } : {}),
          developmentPath: join(process.cwd(), 'dev-runtime', 'msfs-cli', 'msfs.exe'),
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
    const activeTools = new Set<string>();
    const publishToolActivity = () => {
      publishVoiceAttributes({
        [guideVoiceAttributes.toolActivity]: activeTools.size > 0 ? 'calling' : 'idle',
      });
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
      if (participant && event.functionCalls.length > 0) {
        const toolEvent = guideToolEventSchema.parse({
          type: 'guide.tools',
          tools: event.functionCalls.map((call, index) => ({
            name: call.name,
            isError: Boolean(event.functionCallOutputs[index]?.isError),
          })),
        });
        void participant
          .publishData(new TextEncoder().encode(JSON.stringify(toolEvent)), {
            reliable: true,
            topic: guideToolEventsTopic,
          })
          .catch(() => undefined);
      }
      const message = extractGuideSources(event);
      if (!message || !participant) return;
      void participant
        .publishData(new TextEncoder().encode(JSON.stringify(message)), {
          reliable: true,
          topic: guideSourcesTopic,
        })
        .catch(() => undefined);
    });
    const searchTool =
      config.search.apiKey && enabledTools.searchWeb
        ? createSearchWebTool(
            new SearchService({
              provider: config.search.provider,
              apiKey: config.search.apiKey,
              endpoint: config.search.endpoint,
              timeoutMs: config.search.timeoutMs,
            }),
            locale,
          )
        : undefined;
    const tools = observeToolActivity(
      composeGuideTools(createMsfsGuideTools(msfsService, enabledTools), searchTool),
      {
        started: (toolName) => {
          activeTools.add(toolName);
          publishToolActivity();
        },
        completed: (toolName) => {
          activeTools.delete(toolName);
          publishToolActivity();
        },
      },
    );

    await session.start({
      room: ctx.room,
      agent: createGuideAgent(tools, locale),
    });
    session.input.setAudioEnabled(false);
    publishVoiceAttributes({
      [guideVoiceAttributes.inputMode]: inputMode,
      [guideVoiceAttributes.userState]: session.userState,
      [guideVoiceAttributes.toolActivity]: 'idle',
    });
  },
});
