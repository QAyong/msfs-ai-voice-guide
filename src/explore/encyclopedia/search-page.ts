import { exploreCardSchema, type ExploreCard } from '../../../shared/explore-contracts.js';
import type { EncyclopediaCandidate, EncyclopediaProvider } from './provider.js';

export type SearchPageCardOptions = {
  id: string;
  kind: ExploreCard['kind'];
  siteName: string | ((locale: 'zh-CN' | 'en-US') => string);
  allowedHosts: readonly string[];
  buildSearchUrl(query: string, locale: 'zh-CN' | 'en-US'): URL;
};

export type SearchPageEncyclopediaOptions = Omit<SearchPageCardOptions, 'kind'> & {
  id: EncyclopediaProvider['id'];
};

const isAllowedSearchUrl = (url: URL, allowedHosts: readonly string[]) =>
  url.protocol === 'https:' && allowedHosts.includes(url.hostname.toLowerCase());

/** Builds a topic card without fetching or parsing third-party search result pages. */
export const createSearchPageCard = (
  candidate: Pick<EncyclopediaCandidate, 'topicId' | 'query'>,
  options: SearchPageCardOptions,
  locale: 'zh-CN' | 'en-US',
): ExploreCard | null => {
  const query = candidate.query.trim();
  if (!query) return null;

  let url: URL;
  try {
    url = options.buildSearchUrl(query, locale);
  } catch {
    return null;
  }
  if (!isAllowedSearchUrl(url, options.allowedHosts)) return null;

  const card = exploreCardSchema.safeParse({
    id: `${options.id}:${candidate.topicId}`,
    kind: options.kind,
    topicId: candidate.topicId,
    title: query,
    siteName: typeof options.siteName === 'function' ? options.siteName(locale) : options.siteName,
    sourceType: 'search_page',
    url: url.toString(),
  });
  return card.success ? card.data : null;
};

/** Domestic encyclopedias are represented as search topics, rather than guessed entries. */
export class SearchPageEncyclopediaProvider implements EncyclopediaProvider {
  readonly id: SearchPageEncyclopediaOptions['id'];

  constructor(private readonly options: SearchPageEncyclopediaOptions) {
    this.id = options.id;
  }

  async find(
    candidate: EncyclopediaCandidate,
    locale: 'zh-CN' | 'en-US',
    signal?: AbortSignal,
  ): Promise<ExploreCard | null> {
    void signal;
    return createSearchPageCard(candidate, { ...this.options, kind: 'encyclopedia' }, locale);
  }
}
