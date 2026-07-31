import type { ExploreCard } from '../../../shared/explore-contracts.js';

export type VideoCandidate = { topicId: string; query: string };

export interface VideoProvider {
  readonly id: 'youtube' | 'tiktok' | 'douyin';
  find(
    candidate: VideoCandidate,
    locale: 'zh-CN' | 'en-US',
    signal?: AbortSignal,
  ): Promise<ExploreCard[]>;
}
