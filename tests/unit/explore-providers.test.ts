import { describe, expect, it } from 'vitest';
import { BaiduBaikeSearchPageProvider } from '../../src/explore/encyclopedia/baidu-baike.js';
import { Qihoo360BaikeSearchPageProvider } from '../../src/explore/encyclopedia/qihoo-360-baike.js';
import { SearchPageEncyclopediaProvider } from '../../src/explore/encyclopedia/search-page.js';
import { EncyclopediaService } from '../../src/explore/encyclopedia/service.js';
import type { EncyclopediaProvider } from '../../src/explore/encyclopedia/provider.js';
import { BilibiliSearchPageProvider } from '../../src/explore/video/bilibili.js';
import { SearchPageVideoProvider } from '../../src/explore/video/search-page.js';
import { VideoService } from '../../src/explore/video/service.js';
import { YouTubeProvider } from '../../src/explore/video/youtube.js';

describe('explore content providers', () => {
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
  });

  it('resolves a 360 Baike search result to the matching direct entry', async () => {
    const provider = new Qihoo360BaikeSearchPageProvider(
      async () =>
        new Response(
          '<a href="/doc/2383110-2519797.html">长沙市(湖南省省会)_360百科</a><a href="/doc/3398451-3577234.html">沁园春·长沙_360百科</a><a href="/doc/6789348-7005957.html">长沙市城市管理条例_360百科</a>',
          { status: 200 },
        ),
    );
    await expect(
      provider.find({ topicId: 'changsha', query: '长沙', alternateNames: [] }, 'zh-CN'),
    ).resolves.toMatchObject({
      kind: 'encyclopedia',
      title: '长沙市',
      siteName: '360百科',
      sourceType: 'direct',
      url: 'https://baike.so.com/doc/2383110-2519797.html',
    });
  });

  it('falls back to the 360 Baike search page when no direct entry is found', async () => {
    const provider = new Qihoo360BaikeSearchPageProvider(
      async () =>
        new Response('<a href="/doc/3398451-3577234.html">沁园春·长沙_360百科</a>', {
          status: 200,
        }),
    );
    await expect(
      provider.find({ topicId: 'jingzhou', query: '荆州', alternateNames: [] }, 'zh-CN'),
    ).resolves.toMatchObject({
      kind: 'encyclopedia',
      siteName: '360百科 · 搜索主题',
      sourceType: 'search_page',
      url: 'https://baike.so.com/search/?q=%E8%8D%86%E5%B7%9E',
    });
  });

  it('uses a fallback query when another topic resolves to the same encyclopedia URL', async () => {
    const provider: EncyclopediaProvider = {
      id: '360_baike',
      find: async (candidate) => {
        if (candidate.query === '长沙') {
          return {
            id: `360_baike:${candidate.topicId}`,
            kind: 'encyclopedia',
            topicId: candidate.topicId,
            title: '长沙市',
            siteName: '360百科',
            sourceType: 'direct',
            url: 'https://baike.so.com/doc/2383110-2519797.html',
          };
        }
        return {
          id: `360_baike:${candidate.topicId}`,
          kind: 'encyclopedia',
          topicId: candidate.topicId,
          title: candidate.query,
          siteName: '360百科',
          sourceType: 'direct',
          url: 'https://baike.so.com/doc/3398451-3577234.html',
        };
      },
    };
    const service = new EncyclopediaService([provider]);
    await expect(
      service.find(
        '360_baike',
        {
          topics: [
            {
              id: 'city',
              title: '长沙市',
              reason: '城市概况。',
              encyclopediaQuery: '长沙',
              encyclopediaFallbackQueries: [],
              videoQuery: '长沙',
              alternateNames: [],
            },
            {
              id: 'history',
              title: '长沙历史',
              reason: '历史文化。',
              encyclopediaQuery: '长沙',
              encyclopediaFallbackQueries: ['沁园春·长沙'],
              videoQuery: '长沙历史',
              alternateNames: [],
            },
          ],
          suggestedPrompts: ['A?', 'B?', 'C?'],
        },
        'zh-CN',
      ),
    ).resolves.toMatchObject({
      cards: [
        expect.objectContaining({
          topicId: 'city',
          url: 'https://baike.so.com/doc/2383110-2519797.html',
        }),
        expect.objectContaining({
          topicId: 'history',
          url: 'https://baike.so.com/doc/3398451-3577234.html',
        }),
      ],
      unavailable: false,
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

  it('turns web-search YouTube video URLs into direct video cards', async () => {
    const provider = new YouTubeProvider({
      search: async (input) => {
        expect(input).toEqual({ query: '埃菲尔铁塔 旅行视频', site: 'youtube.com' });
        return {
          status: 'ok',
          sources: [
            {
              rank: 1,
              title: 'Eiffel Tower travel guide',
              siteName: 'YouTube',
              url: 'https://www.youtube.com/watch?v=abcDEF12345',
              openMode: 'in_app',
              summary: 'A short guide to the Eiffel Tower.',
            },
            {
              rank: 2,
              title: 'A channel page, not a video',
              siteName: 'YouTube',
              url: 'https://www.youtube.com/@example',
              openMode: 'in_app',
              summary: 'This must be ignored.',
            },
          ],
        };
      },
    });
    await expect(
      provider.find({ topicId: 'tower', query: '埃菲尔铁塔 旅行视频' }, 'zh-CN'),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'youtube:abcDEF12345',
        kind: 'video',
        title: 'Eiffel Tower travel guide',
        sourceType: 'direct',
        url: 'https://www.youtube.com/watch?v=abcDEF12345',
      }),
    ]);
  });

  it('falls back to the YouTube search page when web search has no YouTube result', async () => {
    const provider = new YouTubeProvider({
      search: async () => ({ status: 'no_results', sources: [] }),
    });
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
