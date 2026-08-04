import type { ExploreCard, ExplorePreferences } from '../../../shared/explore-contracts.js';
import type { ExplorePlan } from '../planner.js';
import { isAbortError, runWithProviderTimeout } from '../provider-timeout.js';
import type { VideoProvider } from './provider.js';

const defaultProviderTimeoutMs: Record<VideoProvider['id'], number> = {
  youtube: 4_000,
  bilibili: 1_500,
};

export type VideoServiceOptions = {
  providerTimeoutMs?: Partial<Record<VideoProvider['id'], number>>;
};

export class VideoService {
  constructor(
    private readonly providers: readonly VideoProvider[],
    private readonly options: VideoServiceOptions = {},
  ) {}

  async find(
    preferences: ExplorePreferences,
    plan: ExplorePlan,
    locale: 'zh-CN' | 'en-US',
    signal?: AbortSignal,
  ): Promise<{ cards: ExploreCard[]; unavailable: string[] }> {
    const selected = preferences.videoPlatforms.map((id) => ({
      id,
      provider: this.providers.find((value) => value.id === id),
    }));
    const grouped = await Promise.all(
      selected.map(async ({ id, provider }) => {
        if (!provider) return { id, unavailable: true, cards: [] as ExploreCard[] };
        try {
          const results = await runWithProviderTimeout(
            this.options.providerTimeoutMs?.[provider.id] ?? defaultProviderTimeoutMs[provider.id],
            signal,
            (providerSignal) =>
              Promise.allSettled(
                plan.topics.map((topic) =>
                  provider.find(
                    { topicId: topic.id, query: topic.videoQuery },
                    locale,
                    providerSignal,
                  ),
                ),
              ),
          );
          return {
            id,
            unavailable: results.some((result) => result.status === 'rejected'),
            cards: results.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])),
          };
        } catch (error) {
          if (signal?.aborted || isAbortError(error)) throw error;
          return { id, unavailable: true, cards: [] as ExploreCard[] };
        }
      }),
    );
    const cards = grouped.flatMap((group) => group.cards);
    return {
      cards: cards.filter(
        (card, index) => cards.findIndex((candidate) => candidate.url === card.url) === index,
      ),
      unavailable: grouped.filter((group) => group.unavailable).map((group) => group.id),
    };
  }
}
