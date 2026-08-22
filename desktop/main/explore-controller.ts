import type {
  ExploreRequest,
  ExploreResponse,
  ExploreResult,
} from '../../shared/explore-contracts.js';
import type { ExploreService } from '../../src/explore/service.js';
import type { MsfsExploreContext } from '../../src/msfs/explore-context.js';
import { localizeDesktopText } from '../../shared/desktop-locale.js';
import { conversationFingerprint, ExploreContextCache } from '../../src/explore/context-cache.js';
import { ExploreRequestCoordinator } from '../../src/explore/request-coordinator.js';

type LastSuccess = {
  contextId: string;
  locale: ExploreRequest['locale'];
  preferencesFingerprint: string;
  result: ExploreResult;
};

export { conversationFingerprint };

export type ExploreControllerDependencies = {
  createService(): Promise<ExploreService | null>;
  getMsfsContext(signal: AbortSignal): Promise<MsfsExploreContext | undefined>;
  present(result: ExploreResult): Promise<boolean>;
  contextCache?: ExploreContextCache;
  coordinator?: ExploreRequestCoordinator;
};

export class ExploreController {
  private readonly contextCache: ExploreContextCache;
  private readonly coordinator: ExploreRequestCoordinator;
  private last: LastSuccess | null = null;

  constructor(private readonly dependencies: ExploreControllerDependencies) {
    this.contextCache = dependencies.contextCache ?? new ExploreContextCache();
    this.coordinator = dependencies.coordinator ?? new ExploreRequestCoordinator();
  }

  cancel(): void {
    this.coordinator.cancel('encyclopedia');
  }

  async execute(request: ExploreRequest): Promise<ExploreResponse> {
    const controller = this.coordinator.tryBegin('encyclopedia');
    if (!controller) {
      return {
        ok: false,
        code: 'busy',
        message: localizeDesktopText(
          request.locale,
          'Another exploration action is already in progress.',
          '另一个探索操作正在进行中。',
        ),
      };
    }

    try {
      const { snapshot } = await this.contextCache.get(
        request.recentConversation,
        this.dependencies.getMsfsContext,
        controller.signal,
      );
      const recentConversation = snapshot.recentConversation.length
        ? snapshot.recentConversation.map(({ role, text }) => ({ role, text }))
        : undefined;
      if (!recentConversation && !snapshot.msfs) {
        return {
          ok: false,
          code: 'no_context',
          message: localizeDesktopText(
            request.locale,
            'There is no conversation or flight context to explore yet.',
            '当前没有可用于探索的对话或飞行上下文。',
          ),
        };
      }

      const preferencesFingerprint = JSON.stringify(request.preferences);
      if (
        this.last?.contextId === snapshot.contextId &&
        this.last.locale === request.locale &&
        this.last.preferencesFingerprint === preferencesFingerprint
      ) {
        await this.dependencies.present(this.last.result);
        return { ok: true, result: this.last.result, reused: true };
      }

      const service = await this.dependencies.createService();
      if (!service) {
        return {
          ok: false,
          code: 'configuration',
          message: localizeDesktopText(
            request.locale,
            'The exploration planner is not configured. Add a DeepSeek API key in Settings.',
            '探索规划服务尚未配置，请在设置中填写 DeepSeek API Key。',
          ),
        };
      }
      const result = await service.explore(
        {
          ...(recentConversation ? { recentConversation } : {}),
          ...(snapshot.msfs ? { msfs: snapshot.msfs } : {}),
          preferences: request.preferences,
          locale: request.locale,
        },
        controller.signal,
      );
      this.last = {
        contextId: snapshot.contextId,
        locale: request.locale,
        preferencesFingerprint,
        result,
      };
      await this.dependencies.present(result);
      return { ok: true, result, reused: false };
    } catch (error) {
      if (controller.signal.aborted) {
        return {
          ok: false,
          code: 'cancelled',
          message: localizeDesktopText(request.locale, 'Exploration cancelled.', '探索已取消。'),
        };
      }
      return {
        ok: false,
        code: 'planner_failed',
        message:
          error instanceof Error && error.message.includes('Planner')
            ? localizeDesktopText(
                request.locale,
                'The exploration topics could not be generated.',
                '本次无法生成探索主题。',
              )
            : localizeDesktopText(
                request.locale,
                'Exploration is temporarily unavailable. Try again later.',
                '本次探索暂时不可用，请稍后重试。',
              ),
      };
    } finally {
      this.coordinator.finish(controller);
    }
  }
}
