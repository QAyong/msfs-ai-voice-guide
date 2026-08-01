import { exploreCardSchema, type ExploreCard } from '../../../shared/explore-contracts.js';
import type { SearchService } from '../../search/service.js';
import type { VideoCandidate, VideoProvider } from './provider.js';

type YouTubeSearchClient = Pick<SearchService, 'search'>;

const allowedHosts = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

const isVideoId = (value: string) => /^[A-Za-z0-9_-]{6,32}$/.test(value);

const getYouTubeVideo = (value: string): { id: string; url: string } | null => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname.toLowerCase())) {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  const segments = parsed.pathname.split('/').filter(Boolean);
  const videoId =
    hostname === 'youtu.be'
      ? segments[0]
      : parsed.pathname === '/watch'
        ? (parsed.searchParams.get('v') ?? undefined)
        : segments[0] && ['shorts', 'embed', 'live'].includes(segments[0])
          ? segments[1]
          : undefined;
  if (!videoId || !isVideoId(videoId)) return null;

  return {
    id: videoId,
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
  };
};

const compactSummary = (value: string | undefined) => {
  const summary = value?.replace(/\s+/g, ' ').trim();
  return summary ? summary.slice(0, 360) : undefined;
};

const abortError = () => new DOMException('Aborted', 'AbortError');

const createSearchPageCard = (candidate: VideoCandidate): ExploreCard | null => {
  const url = new URL('https://www.youtube.com/results');
  url.searchParams.set('search_query', candidate.query);
  const card = exploreCardSchema.safeParse({
    id: `youtube:search:${candidate.topicId}`,
    kind: 'video',
    topicId: candidate.topicId,
    title: candidate.query,
    siteName: 'YouTube · 网页搜索',
    sourceType: 'search_page',
    url: url.toString(),
  });
  return card.success ? card.data : null;
};

/** Discovers real YouTube video pages through the configured web-search service. */
export class YouTubeProvider implements VideoProvider {
  readonly id = 'youtube' as const;

  constructor(private readonly search: YouTubeSearchClient) {}

  async find(
    candidate: VideoCandidate,
    _locale: 'zh-CN' | 'en-US',
    signal?: AbortSignal,
  ): Promise<ExploreCard[]> {
    if (signal?.aborted) throw abortError();

    const result = await this.search.search(
      { query: candidate.query, site: 'youtube.com' },
      signal,
    );
    if (signal?.aborted) throw abortError();
    if (result.status === 'error') {
      throw new Error(`YouTube 网页搜索失败：${result.code}`);
    }
    if (result.status !== 'ok') {
      const fallback = createSearchPageCard(candidate);
      return fallback ? [fallback] : [];
    }

    const seenIds = new Set<string>();
    const cards = result.sources
      .flatMap((source) => {
        const video = getYouTubeVideo(source.url);
        if (!video || seenIds.has(video.id)) return [];
        seenIds.add(video.id);
        const summary = compactSummary(source.summary ?? source.content);
        const card = exploreCardSchema.safeParse({
          id: `youtube:${video.id}`,
          kind: 'video',
          topicId: candidate.topicId,
          title: source.title,
          siteName: 'YouTube',
          sourceType: 'direct',
          url: video.url,
          ...(summary ? { summary } : {}),
          ...(source.thumbnailUrl ? { thumbnailUrl: source.thumbnailUrl } : {}),
          ...(source.publishTime ? { publishTime: source.publishTime } : {}),
        });
        return card.success ? [card.data] : [];
      })
      .slice(0, 3);
    if (cards.length > 0) return cards;
    const fallback = createSearchPageCard(candidate);
    return fallback ? [fallback] : [];
  }
}
