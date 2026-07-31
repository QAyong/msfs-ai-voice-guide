import type { ExploreCard, ExplorePreferences } from '../../../shared/explore-contracts.js';
import type { ExplorePlan } from '../planner.js';
import type { VideoProvider } from './provider.js';

export class VideoService {
  constructor(private readonly providers: readonly VideoProvider[]) {}

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
        const results = await Promise.allSettled(
          plan.topics.map((topic) =>
            provider.find({ topicId: topic.id, query: topic.videoQuery }, locale, signal),
          ),
        );
        return {
          id,
          unavailable: results.some((result) => result.status === 'rejected'),
          cards: results.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])),
        };
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
