import { exploreCardSchema, type ExploreCard } from '../../../shared/explore-contracts.js';
import type { VideoCandidate, VideoProvider } from './provider.js';

type SearchPageVideoOptions = {
  id: 'youtube' | 'bilibili';
  siteName: string | ((locale: 'zh-CN' | 'en-US') => string);
  allowedHosts: readonly string[];
  buildSearchUrl(query: string): URL;
};

const isAllowedSearchUrl = (url: URL, allowedHosts: readonly string[]) =>
  url.protocol === 'https:' && allowedHosts.includes(url.hostname.toLowerCase());

export const createVideoSearchPageCard = (
  candidate: VideoCandidate,
  options: SearchPageVideoOptions,
  locale: 'zh-CN' | 'en-US',
): ExploreCard | null => {
  const query = candidate.query.trim();
  if (!query) return null;

  let url: URL;
  try {
    url = options.buildSearchUrl(query);
  } catch {
    return null;
  }
  if (!isAllowedSearchUrl(url, options.allowedHosts)) return null;

  const card = exploreCardSchema.safeParse({
    id: `${options.id}:search:${candidate.topicId}`,
    kind: 'video',
    topicId: candidate.topicId,
    title: query,
    siteName: typeof options.siteName === 'function' ? options.siteName(locale) : options.siteName,
    sourceType: 'search_page',
    url: url.toString(),
  });
  return card.success ? card.data : null;
};

/**
 * Platform search pages are the stable discovery boundary for providers that do not
 * need backend result scraping. This provider intentionally does not access private,
 * signed or account-bound result APIs.
 */
export class SearchPageVideoProvider implements VideoProvider {
  readonly id: SearchPageVideoOptions['id'];

  constructor(private readonly options: SearchPageVideoOptions) {
    this.id = options.id;
  }

  async find(
    candidate: VideoCandidate,
    locale: 'zh-CN' | 'en-US',
    signal?: AbortSignal,
  ): Promise<ExploreCard[]> {
    void signal;
    const card = createVideoSearchPageCard(candidate, this.options, locale);
    return card ? [card] : [];
  }
}
