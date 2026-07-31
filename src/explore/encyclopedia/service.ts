import type { ExploreCard } from '../../../shared/explore-contracts.js';
import type { ExplorePlan } from '../planner.js';
import type { EncyclopediaProvider } from './provider.js';

export class EncyclopediaService {
  constructor(private readonly providers: readonly EncyclopediaProvider[]) {}

  async find(
    providerId: EncyclopediaProvider['id'],
    plan: ExplorePlan,
    locale: 'zh-CN' | 'en-US',
    signal?: AbortSignal,
  ): Promise<{ cards: ExploreCard[]; unavailable: boolean }> {
    const provider = this.providers.find((candidate) => candidate.id === providerId);
    if (!provider) return { cards: [], unavailable: true };
    const found = await Promise.allSettled(
      plan.topics.map((topic) =>
        provider.find(
          {
            topicId: topic.id,
            query: topic.encyclopediaQuery,
            alternateNames: topic.alternateNames,
          },
          locale,
          signal,
        ),
      ),
    );
    return {
      cards: found.flatMap((result) =>
        result.status === 'fulfilled' && result.value ? [result.value] : [],
      ),
      unavailable: found.some((result) => result.status === 'rejected'),
    };
  }
}
