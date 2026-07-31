import { Innertube } from 'youtubei.js';
import { exploreCardSchema, type ExploreCard } from '../../../shared/explore-contracts.js';
import type { VideoCandidate, VideoProvider } from './provider.js';

type YouTubeVideoNode = {
  video_id?: unknown;
  title?: { toString?(): string };
  description?: unknown;
  author?: { name?: unknown };
  best_thumbnail?: { url?: unknown };
  published?: { toString?(): string };
};

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** Non-official InnerTube adapter; callers must tolerate platform changes. */
export class YouTubeProvider implements VideoProvider {
  readonly id = 'youtube' as const;
  private client: Promise<Innertube> | null = null;

  private getClient() {
    this.client ??= Innertube.create();
    return this.client;
  }

  async find(
    candidate: VideoCandidate,
    _locale: 'zh-CN' | 'en-US',
    signal?: AbortSignal,
  ): Promise<ExploreCard[]> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const search = await (await this.getClient()).search(candidate.query);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return search.results
      .flatMap((node) => {
        const video = node as unknown as YouTubeVideoNode;
        const videoId = text(video.video_id);
        const title = video.title?.toString?.().trim() ?? '';
        if (!videoId || !title) return [];
        const card = exploreCardSchema.safeParse({
          id: `youtube:${videoId}`,
          kind: 'video',
          topicId: candidate.topicId,
          title,
          siteName: 'YouTube',
          url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
          ...(text(video.description) ? { summary: text(video.description) } : {}),
          ...(text(video.author?.name) ? { author: text(video.author?.name) } : {}),
          ...(text(video.best_thumbnail?.url)
            ? { thumbnailUrl: text(video.best_thumbnail?.url) }
            : {}),
          ...(video.published?.toString?.().trim()
            ? { publishTime: video.published.toString().trim() }
            : {}),
        });
        return card.success ? [card.data] : [];
      })
      .slice(0, 3);
  }
}
