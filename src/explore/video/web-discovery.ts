import { z } from 'zod';
import { exploreCardSchema, type ExploreCard } from '../../../shared/explore-contracts.js';
import type { WebDiscoveryProvider } from '../discovery/provider.js';
import type { VideoCandidate, VideoProvider } from './provider.js';

const tiktokOEmbedSchema = z.object({
  title: z.string().trim().min(1),
  author_name: z.string().trim().min(1).optional(),
  thumbnail_url: z.string().url().optional(),
  provider_name: z.string().trim().min(1).optional(),
});

type WebVideoOptions = {
  id: 'tiktok' | 'douyin';
  siteName: string;
  domains: readonly string[];
  enrichWithTikTokOEmbed?: boolean;
};

const isTikTokVideo = (url: string) =>
  /^https?:\/\/(?:www\.)?tiktok\.com\/[^\s]+\/video\/\d+/iu.test(url);

/**
 * Discovers an already-public page. TikTok metadata is then enriched through its official
 * oEmbed endpoint; Douyin intentionally stays metadata-light until it has a stable public API.
 */
export class WebDiscoveryVideoProvider implements VideoProvider {
  readonly id: WebVideoOptions['id'];

  constructor(
    private readonly discovery: WebDiscoveryProvider,
    private readonly options: WebVideoOptions,
  ) {
    this.id = options.id;
  }

  async find(
    candidate: VideoCandidate,
    locale: 'zh-CN' | 'en-US',
    signal?: AbortSignal,
  ): Promise<ExploreCard[]> {
    const discovered = await this.discovery.search(
      `site:${this.options.domains[0]} ${candidate.query}`,
      { domains: this.options.domains, locale },
      signal,
    );
    const candidates = discovered.filter((result) =>
      this.id === 'tiktok' ? isTikTokVideo(result.url) : true,
    );
    const cards = await Promise.allSettled(
      candidates.slice(0, 3).map((result) => this.toCard(candidate.topicId, result, signal)),
    );
    return cards.flatMap((result) =>
      result.status === 'fulfilled' && result.value ? [result.value] : [],
    );
  }

  private async toCard(
    topicId: string,
    result: Awaited<ReturnType<WebDiscoveryProvider['search']>>[number],
    signal?: AbortSignal,
  ): Promise<ExploreCard | null> {
    let metadata: z.infer<typeof tiktokOEmbedSchema> | undefined;
    if (this.options.enrichWithTikTokOEmbed) {
      const endpoint = new URL('https://www.tiktok.com/oembed');
      endpoint.searchParams.set('url', result.url);
      const response = await fetch(endpoint, { ...(signal ? { signal } : {}) });
      if (response.ok) {
        const parsed = tiktokOEmbedSchema.safeParse(await response.json());
        if (parsed.success) metadata = parsed.data;
      }
    }
    const card = exploreCardSchema.safeParse({
      id: `${this.id}:${encodeURIComponent(result.url)}`,
      kind: 'video',
      topicId,
      title: metadata?.title ?? result.title,
      siteName: metadata?.provider_name ?? this.options.siteName,
      url: result.url,
      ...(result.description ? { summary: result.description } : {}),
      ...(metadata?.author_name ? { author: metadata.author_name } : {}),
      ...(metadata?.thumbnail_url ? { thumbnailUrl: metadata.thumbnail_url } : {}),
    });
    return card.success ? card.data : null;
  }
}
