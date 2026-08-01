import type { ExploreCard } from '../../../shared/explore-contracts.js';

export type EncyclopediaCandidate = {
  topicId: string;
  query: string;
  alternateNames: string[];
};

export interface EncyclopediaProvider {
  readonly id: 'wikipedia' | 'baidu_baike' | '360_baike';
  find(
    candidate: EncyclopediaCandidate,
    locale: 'zh-CN' | 'en-US',
    signal?: AbortSignal,
  ): Promise<ExploreCard | null>;
}
