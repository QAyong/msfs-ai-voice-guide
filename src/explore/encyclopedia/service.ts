import type { ExploreCard } from '../../../shared/explore-contracts.js';
import type { ExplorePlan } from '../planner.js';
import { isAbortError, runWithProviderTimeout } from '../provider-timeout.js';
import type { EncyclopediaProvider } from './provider.js';

const defaultProviderTimeoutMs: Record<EncyclopediaProvider['id'], number> = {
  wikipedia: 4_000,
  baidu_baike: 2_500,
  '360_baike': 3_000,
};

export type EncyclopediaServiceOptions = {
  providerTimeoutMs?: Partial<Record<EncyclopediaProvider['id'], number>>;
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
    const cards: ExploreCard[] = [];
    const seenUrls = new Set<string>();
    let unavailable = false;

    // Resolve topics in planner order so the first topic wins when a provider
    // accidentally maps two different queries to the same canonical page.
    for (const topic of plan.topics) {
      const queries = [topic.encyclopediaQuery, ...topic.encyclopediaFallbackQueries];
      let searchPageFallback: ExploreCard | null = null;
      let resolved: ExploreCard | null = null;

      try {
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

          const urlKey = canonicalizeEncyclopediaUrl(card.url);
          if (seenUrls.has(urlKey)) continue;
          if (card.sourceType === 'search_page') {
            // A search page is only a fallback. Keep looking for a concrete
            // entry from the topic's alternative queries first.
            searchPageFallback ??= card;
            continue;
          }
          resolved = card;
          break;
        }

        if (!resolved && searchPageFallback) resolved = searchPageFallback;
      } catch {
        unavailable = true;
      }

      if (resolved) {
        seenUrls.add(canonicalizeEncyclopediaUrl(resolved.url));
        cards.push(resolved);
      }
    }

    return { cards, unavailable };
  }
}
