import { exploreCardSchema, type ExploreCard } from '../../../shared/explore-contracts.js';
import type { VideoCandidate, VideoProvider } from './provider.js';

type SearchPageVideoOptions = {
  id: 'bilibili';
  siteName: string;
  allowedHosts: readonly string[];
  buildSearchUrl(query: string): URL;
};

const isAllowedSearchUrl = (url: URL, allowedHosts: readonly string[]) =>
  url.protocol === 'https:' && allowedHosts.includes(url.hostname.toLowerCase());

export const createVideoSearchPageCard = (
  candidate: VideoCandidate,
  options: SearchPageVideoOptions,
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
    siteName: options.siteName,
    sourceType: 'search_page',
    url: url.toString(),
  });
  return card.success ? card.data : null;
};

/**
 * Domestic platforms currently use their own search UI as the stable fallback.
 * This provider intentionally does not scrape private or signed result APIs.
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
    void locale;
    void signal;
    const card = createVideoSearchPageCard(candidate, this.options);
    return card ? [card] : [];
  }
}
