import { createSearchPageCard } from '../encyclopedia/search-page.js';
import type { VideoCandidate, VideoProvider } from './provider.js';

/**
 * Douyin search is opened as an in-app search page. We deliberately do not
 * scrape its video list or require account cookies; the user selects a result
 * in the isolated source window.
 */
export class DouyinSearchPageProvider implements VideoProvider {
  readonly id = 'douyin' as const;

  async find(candidate: VideoCandidate, locale: 'zh-CN' | 'en-US', signal?: AbortSignal) {
    void locale;
    void signal;
    const card = createSearchPageCard(candidate, {
      id: this.id,
      kind: 'video',
      siteName: '抖音 · 搜索主题',
      allowedHosts: ['www.douyin.com', 'douyin.com'],
      buildSearchUrl: (query) => {
        const url = new URL(
          `/jingxuan/search/${encodeURIComponent(query)}`,
          'https://www.douyin.com',
        );
        url.searchParams.set('type', 'general');
        return url;
      },
    });
    return card ? [card] : [];
  }
}
