import type { ExploreCard } from '../../../shared/explore-contracts.js';
import type { ExplorePlan } from '../planner.js';
import { isAbortError, runWithProviderTimeout } from '../provider-timeout.js';
import type { EncyclopediaProvider } from './provider.js';

const defaultProviderTimeoutMs: Record<EncyclopediaProvider['id'], number> = {
  wikipedia: 4_000,
  baidu_baike: 2_500,
};

export type EncyclopediaServiceOptions = {
  providerTimeoutMs?: Partial<Record<EncyclopediaProvider['id'], number>>;
  topicConcurrency?: number;
};

const defaultTopicConcurrency = 5;

type TopicResolution = {
  candidates: ExploreCard[];
  unavailable: boolean;
};

export const canonicalizeEncyclopediaUrl = (value: string) => {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/iu.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLocaleLowerCase();
    url.pathname = url.pathname.replace(/\/+$/u, '') || '/';
    return url.toString();
  } catch {
    return value;
  }
};

export class EncyclopediaService {
  constructor(
    private readonly providers: readonly EncyclopediaProvider[],
    private readonly options: EncyclopediaServiceOptions = {},
  ) {}

  async find(
    providerId: EncyclopediaProvider['id'],
    plan: ExplorePlan,
    locale: 'zh-CN' | 'en-US',
    signal?: AbortSignal,
  ): Promise<{ cards: ExploreCard[]; unavailable: boolean }> {
    const provider = this.providers.find((candidate) => candidate.id === providerId);
    if (!provider) return { cards: [], unavailable: true };
    try {
      return await runWithProviderTimeout(
        this.options.providerTimeoutMs?.[provider.id] ?? defaultProviderTimeoutMs[provider.id],
        signal,
        (providerSignal) => this.findFromProvider(provider, plan, locale, providerSignal),
      );
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) throw error;
      return { cards: [], unavailable: true };
    }
  }

  private async findFromProvider(
    provider: EncyclopediaProvider,
    plan: ExplorePlan,
    locale: 'zh-CN' | 'en-US',
    signal: AbortSignal,
  ): Promise<{ cards: ExploreCard[]; unavailable: boolean }> {
    const topicConcurrency = Math.max(
      1,
      Math.floor(this.options.topicConcurrency ?? defaultTopicConcurrency),
    );
    const resolutions = new Array<TopicResolution>(plan.topics.length);
    let nextTopicIndex = 0;

    const resolveTopic = async (topic: ExplorePlan['topics'][number]): Promise<TopicResolution> => {
      const candidates: ExploreCard[] = [];
      let searchPageFallback: ExploreCard | null = null;
      let unavailable = false;

      try {
        // Queries for one topic remain serial: the primary query is followed by
        // its fallbacks, while different topics are resolved concurrently.
        const queries = [topic.encyclopediaQuery, ...topic.encyclopediaFallbackQueries];
        for (const query of queries) {
          const card = await provider.find(
            {
              topicId: topic.id,
              query,
              alternateNames: topic.alternateNames,
            },
            locale,
            signal,
          );
          if (!card) continue;

          if (card.sourceType === 'search_page') {
            // A search page is only a fallback. Keep the first one in case no
            // concrete entry is returned by any of the topic queries.
            searchPageFallback ??= card;
            continue;
          }
          // Keep all direct candidates so final ordered merging can skip a
          // duplicate owned by an earlier topic and use this topic's fallback.
          candidates.push(card);
        }
      } catch {
        unavailable = true;
      }

      if (searchPageFallback) candidates.push(searchPageFallback);
      return { candidates, unavailable };
    };

    const worker = async () => {
      while (true) {
        const topicIndex = nextTopicIndex;
        nextTopicIndex += 1;
        if (topicIndex >= plan.topics.length) return;
        const topic = plan.topics[topicIndex];
        if (!topic) return;
        resolutions[topicIndex] = await resolveTopic(topic);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(topicConcurrency, plan.topics.length) }, () => worker()),
    );

    const cards: ExploreCard[] = [];
    const seenUrls = new Set<string>();

    // Merge in planner order after concurrent resolution so the first topic
    // still wins when providers return the same canonical page twice.
    for (const resolution of resolutions) {
      if (!resolution) continue;
      for (const candidate of resolution.candidates) {
        const urlKey = canonicalizeEncyclopediaUrl(candidate.url);
        if (seenUrls.has(urlKey)) continue;
        seenUrls.add(urlKey);
        cards.push(candidate);
        break;
      }
    }

    return {
      cards,
      unavailable: resolutions.some((resolution) => resolution?.unavailable),
    };
  }
}
