import { randomUUID } from 'node:crypto';
import {
  type ExploreNarrationRequest,
  type ExploreNarrationResponse,
} from '../../shared/explore-contracts.js';
import { ExploreContextCache, type ExploreContextCacheReader } from './context-cache.js';
import { buildExploreNarrationPrompt } from './narrator.js';
import { ExploreRequestCoordinator } from './request-coordinator.js';
import { localizeDesktopText } from '../../shared/desktop-locale.js';

export type ExploreNarrationControllerDependencies = {
  getMsfsContext: ExploreContextCacheReader;
  contextCache?: ExploreContextCache;
  coordinator?: ExploreRequestCoordinator;
};

export class ExploreNarrationController {
  private readonly contextCache: ExploreContextCache;
  private readonly coordinator: ExploreRequestCoordinator;

  constructor(private readonly dependencies: ExploreNarrationControllerDependencies) {
    this.contextCache = dependencies.contextCache ?? new ExploreContextCache();
    this.coordinator = dependencies.coordinator ?? new ExploreRequestCoordinator();
  }

  cancel(): boolean {
    return this.coordinator.cancel('narration');
  }

  async execute(request: ExploreNarrationRequest): Promise<ExploreNarrationResponse> {
    const controller = this.coordinator.tryBegin('narration');
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
      if (snapshot.recentConversation.length === 0 && !snapshot.msfs) {
        return {
          ok: false,
          code: 'no_context',
          message: localizeDesktopText(
            request.locale,
            'There is no current flight or conversation context to introduce yet.',
            '当前没有可用于介绍的飞行或对话上下文。',
          ),
        };
      }

      return {
        ok: true,
        narrationId: randomUUID(),
        contextId: snapshot.contextId,
        prompt: buildExploreNarrationPrompt({
          locale: request.locale,
          recentConversation: snapshot.recentConversation,
          msfs: snapshot.msfs,
        }),
      };
    } catch {
      if (controller.signal.aborted) {
        return {
          ok: false,
          code: 'cancelled',
          message: localizeDesktopText(request.locale, 'Introduction cancelled.', '介绍已取消。'),
        };
      }
      return {
        ok: false,
        code: 'configuration',
        message: localizeDesktopText(
          request.locale,
          'The current flight context could not be read.',
          '当前飞行上下文读取失败。',
        ),
      };
    } finally {
      this.coordinator.finish(controller);
    }
  }
}
