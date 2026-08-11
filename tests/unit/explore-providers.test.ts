import { describe, expect, it } from 'vitest';
import { BaiduBaikeSearchPageProvider } from '../../src/explore/encyclopedia/baidu-baike.js';
import { SearchPageEncyclopediaProvider } from '../../src/explore/encyclopedia/search-page.js';
import { EncyclopediaService } from '../../src/explore/encyclopedia/service.js';
import type { EncyclopediaProvider } from '../../src/explore/encyclopedia/provider.js';
import { WikipediaSearchPageProvider } from '../../src/explore/encyclopedia/wikipedia-search-page.js';
import { BilibiliSearchPageProvider } from '../../src/explore/video/bilibili.js';
import { SearchPageVideoProvider } from '../../src/explore/video/search-page.js';
import { VideoService } from '../../src/explore/video/service.js';
import { YouTubeSearchPageProvider } from '../../src/explore/video/youtube.js';

describe('explore content providers', () => {
  it('builds a Wikipedia search-page card without fetching Wikipedia', async () => {
    const provider = new WikipediaSearchPageProvider();
    await expect(
      provider.find({ topicId: 'changsha', query: '长沙', alternateNames: [] }, 'zh-CN'),
    ).resolves.toMatchObject({
      kind: 'encyclopedia',
      title: '长沙',
      siteName: 'Wikipedia · 搜索主题',
      sourceType: 'search_page',
      url: 'https://zh.wikipedia.org/w/index.php?search=%E9%95%BF%E6%B2%99',
    });
    await expect(
      provider.find({ topicId: 'london', query: 'London', alternateNames: [] }, 'en-US'),
    ).resolves.toMatchObject({
      siteName: 'Wikipedia · Search',
      url: 'https://en.wikipedia.org/w/index.php?search=London',
    });
  });

  it('builds a trusted Baidu Baike search-page card without fetching a third-party page', async () => {
    const provider = new BaiduBaikeSearchPageProvider();
    await expect(
      provider.find({ topicId: 'tower', query: '埃菲尔铁塔', alternateNames: [] }, 'zh-CN'),
    ).resolves.toMatchObject({
      kind: 'encyclopedia',
      title: '埃菲尔铁塔',
      siteName: '百度百科 · 搜索主题',
      url: 'https://baike.baidu.com/search/word?pic=1&sug=1&word=%E5%9F%83%E8%8F%B2%E5%B0%94%E9%93%81%E5%A1%94',
    });
    await expect(
      provider.find({ topicId: 'tower', query: 'Eiffel Tower', alternateNames: [] }, 'en-US'),
    ).resolves.toMatchObject({
      siteName: 'Baidu Baike · Search',
    });
  });

  it('does not return a duplicate encyclopedia card when no fallback is unique', async () => {
    const provider: EncyclopediaProvider = {
      id: 'wikipedia',
      find: async (candidate) => ({
        id: `wikipedia:${candidate.topicId}`,
        kind: 'encyclopedia',
        topicId: candidate.topicId,
        title: 'Paris',
        siteName: 'Wikipedia',
        url: 'https://zh.wikipedia.org/wiki/Paris',
      }),
    };
    const service = new EncyclopediaService([provider]);
    const result = await service.find(
      'wikipedia',
      {
        topics: [
          {
            id: 'one',
            title: '巴黎',
            reason: '城市。',
            encyclopediaQuery: '巴黎',
            encyclopediaFallbackQueries: [],
            videoQuery: '巴黎',
            alternateNames: [],
          },
          {
            id: 'two',
            title: '巴黎历史',
            reason: '历史。',
            encyclopediaQuery: '巴黎历史',
            encyclopediaFallbackQueries: ['Paris'],
            videoQuery: '巴黎历史',
            alternateNames: [],
          },
        ],
        suggestedPrompts: ['A?', 'B?', 'C?'],
      },
      'zh-CN',
    );
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.topicId).toBe('one');
  });

  it('resolves encyclopedia topics concurrently and merges them in planner order', async () => {
    let active = 0;
    let maximumActive = 0;
    let releaseTopics: (() => void) | undefined;
    let resolveAllStarted: (() => void) | undefined;
    const allStarted = new Promise<void>((resolve) => {
      resolveAllStarted = resolve;
    });
    const topicsReleased = new Promise<void>((resolve) => {
      releaseTopics = resolve;
    });
    const provider: EncyclopediaProvider = {
      id: 'wikipedia',
      find: async (candidate) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        if (active === 5) resolveAllStarted?.();
        await topicsReleased;
        active -= 1;
        return {
          id: `wikipedia:${candidate.topicId}`,
          kind: 'encyclopedia',
          topicId: candidate.topicId,
          title: candidate.query,
          siteName: 'Wikipedia',
          url: `https://zh.wikipedia.org/wiki/${candidate.topicId}`,
        };
      },
    };
    const service = new EncyclopediaService([provider]);
    const resultPromise = service.find(
      'wikipedia',
      {
        topics: [
          {
            id: 'one',
            title: '一',
            reason: '主题一。',
            encyclopediaQuery: '一',
            encyclopediaFallbackQueries: [],
            videoQuery: '一',
            alternateNames: [],
          },
          {
            id: 'two',
            title: '二',
            reason: '主题二。',
            encyclopediaQuery: '二',
            encyclopediaFallbackQueries: [],
            videoQuery: '二',
            alternateNames: [],
          },
          {
            id: 'three',
            title: '三',
            reason: '主题三。',
            encyclopediaQuery: '三',
            encyclopediaFallbackQueries: [],
            videoQuery: '三',
            alternateNames: [],
          },
          {
            id: 'four',
            title: '四',
            reason: '主题四。',
            encyclopediaQuery: '四',
            encyclopediaFallbackQueries: [],
            videoQuery: '四',
            alternateNames: [],
          },
          {
            id: 'five',
            title: '五',
            reason: '主题五。',
            encyclopediaQuery: '五',
            encyclopediaFallbackQueries: [],
            videoQuery: '五',
            alternateNames: [],
          },
        ],
        suggestedPrompts: ['问题一？', '问题二？', '问题三？'],
      },
      'zh-CN',
    );

    await allStarted;
    expect(maximumActive).toBe(5);
    releaseTopics?.();

    await expect(resultPromise).resolves.toMatchObject({
      cards: [
        { topicId: 'one' },
        { topicId: 'two' },
        { topicId: 'three' },
        { topicId: 'four' },
        { topicId: 'five' },
      ],
      unavailable: false,
    });
  });

  it('builds a YouTube search-page card without a backend search request', async () => {
    const provider = new YouTubeSearchPageProvider();
    await expect(
      provider.find({ topicId: 'tower', query: '埃菲尔铁塔 旅行视频' }, 'zh-CN'),
    ).resolves.toEqual([
      expect.objectContaining({
        kind: 'video',
        siteName: 'YouTube · 网页搜索',
        sourceType: 'search_page',
        url: 'https://www.youtube.com/results?search_query=%E5%9F%83%E8%8F%B2%E5%B0%94%E9%93%81%E5%A1%94+%E6%97%85%E8%A1%8C%E8%A7%86%E9%A2%91',
      }),
    ]);
    await expect(
      provider.find({ topicId: 'tower', query: 'Tower Bridge history' }, 'en-US'),
    ).resolves.toEqual([
      expect.objectContaining({
        siteName: 'YouTube · Web search',
        url: 'https://www.youtube.com/results?search_query=Tower+Bridge+history',
      }),
    ]);
  });

  it('drops a search-page card when its provider creates an off-allowlist URL', async () => {
    const provider = new SearchPageEncyclopediaProvider({
      id: 'baidu_baike',
      siteName: 'Test',
      allowedHosts: ['baike.baidu.com'],
      buildSearchUrl: () => new URL('https://example.com/search'),
    });
    await expect(
      provider.find(
        { topicId: 'tower', query: '埃菲尔铁塔', alternateNames: ['Eiffel Tower'] },
        'zh-CN',
      ),
    ).resolves.toBeNull();
  });

  it('builds a Bilibili search-page card', async () => {
    const provider = new BilibiliSearchPageProvider();
    await expect(provider.find({ topicId: 'changsha', query: '长沙' }, 'zh-CN')).resolves.toEqual([
      expect.objectContaining({
        kind: 'video',
        siteName: '哔哩哔哩 · 站内搜索',
        sourceType: 'search_page',
        url: 'https://search.bilibili.com/all?keyword=%E9%95%BF%E6%B2%99',
      }),
    ]);
    await expect(provider.find({ topicId: 'london', query: 'London' }, 'en-US')).resolves.toEqual([
      expect.objectContaining({
        siteName: 'Bilibili · Site search',
        url: 'https://search.bilibili.com/all?keyword=London',
      }),
    ]);
  });

  it('drops a video search-page card when its provider creates an off-allowlist URL', async () => {
    const provider = new SearchPageVideoProvider({
      id: 'bilibili',
      siteName: 'Test',
      allowedHosts: ['search.bilibili.com'],
      buildSearchUrl: () => new URL('https://example.com/search'),
    });
    await expect(
      provider.find({ topicId: 'tower', query: '埃菲尔铁塔' }, 'zh-CN'),
    ).resolves.toEqual([]);
  });

  it('keeps successful video platforms when another selected platform fails', async () => {
    const service = new VideoService([
      {
        id: 'youtube',
        find: async () => [
          {
            id: 'youtube:one',
            kind: 'video',
            topicId: 'tower',
            title: 'Tower guide',
            siteName: 'YouTube',
            url: 'https://www.youtube.com/watch?v=one',
          },
        ],
      },
      { id: 'bilibili', find: async () => Promise.reject(new Error('blocked')) },
    ]);
    await expect(
      service.find(
        { encyclopedia: 'wikipedia', videoPlatforms: ['youtube', 'bilibili'] },
        {
          topics: [
            {
              id: 'tower',
              title: 'Tower',
              reason: 'Topic',
              encyclopediaQuery: 'Tower',
              encyclopediaFallbackQueries: [],
              videoQuery: 'Tower guide',
              alternateNames: [],
            },
            {
              id: 'paris',
              title: 'Paris',
              reason: 'Topic',
              encyclopediaQuery: 'Paris',
              encyclopediaFallbackQueries: [],
              videoQuery: 'Paris guide',
              alternateNames: [],
            },
            {
              id: 'rome',
              title: 'Rome',
              reason: 'Topic',
              encyclopediaQuery: 'Rome',
              encyclopediaFallbackQueries: [],
              videoQuery: 'Rome guide',
              alternateNames: [],
            },
          ],
          suggestedPrompts: ['A?', 'B?', 'C?'],
        },
        'en-US',
      ),
    ).resolves.toMatchObject({ unavailable: ['bilibili'], cards: [{ id: 'youtube:one' }] });
  });
});
