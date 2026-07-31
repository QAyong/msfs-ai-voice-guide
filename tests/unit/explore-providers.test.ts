import { describe, expect, it } from 'vitest';
import { BaiduBaikeSearchPageProvider } from '../../src/explore/encyclopedia/baidu-baike.js';
import { DouyinBaikeSearchPageProvider } from '../../src/explore/encyclopedia/douyin-baike.js';
import { SearchPageEncyclopediaProvider } from '../../src/explore/encyclopedia/search-page.js';
import { DouyinSearchPageProvider } from '../../src/explore/video/douyin-search-page.js';
import { WebDiscoveryVideoProvider } from '../../src/explore/video/web-discovery.js';
import { VideoService } from '../../src/explore/video/service.js';

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

  it('builds the documented Douyin Baike search-page card', async () => {
    const provider = new DouyinBaikeSearchPageProvider();
    await expect(
      provider.find({ topicId: 'jingzhou', query: '荆州', alternateNames: [] }, 'zh-CN'),
    ).resolves.toMatchObject({
      kind: 'encyclopedia',
      siteName: '抖音百科 / 快懂百科 · 搜索主题',
      url: 'https://www.baike.com/search?keyword=%E8%8D%86%E5%B7%9E&activeTab=DOC_TAB',
    });
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

  it('builds the documented Douyin search-page card without an opaque aid parameter', async () => {
    const provider = new DouyinSearchPageProvider();
    await expect(provider.find({ topicId: 'changsha', query: '长沙' }, 'zh-CN')).resolves.toEqual([
      expect.objectContaining({
        kind: 'video',
        siteName: '抖音 · 搜索主题',
        url: 'https://www.douyin.com/jingxuan/search/%E9%95%BF%E6%B2%99?type=general',
      }),
    ]);
  });

  it('does not turn a non-video TikTok URL into a video card', async () => {
    const provider = new WebDiscoveryVideoProvider(
      {
        search: async () => [
          {
            title: 'TikTok profile',
            url: 'https://www.tiktok.com/@creator',
            hostname: 'www.tiktok.com',
          },
        ],
      },
      { id: 'tiktok', siteName: 'TikTok', domains: ['tiktok.com'], enrichWithTikTokOEmbed: true },
    );
    await expect(
      provider.find({ topicId: 'tower', query: 'Eiffel Tower' }, 'en-US'),
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
      { id: 'douyin', find: async () => Promise.reject(new Error('blocked')) },
    ]);
    await expect(
      service.find(
        { encyclopedia: 'wikipedia', videoPlatforms: ['youtube', 'douyin'] },
        {
          topics: [
            {
              id: 'tower',
              title: 'Tower',
              reason: 'Topic',
              encyclopediaQuery: 'Tower',
              videoQuery: 'Tower guide',
              alternateNames: [],
            },
            {
              id: 'paris',
              title: 'Paris',
              reason: 'Topic',
              encyclopediaQuery: 'Paris',
              videoQuery: 'Paris guide',
              alternateNames: [],
            },
          ],
          suggestedPrompts: ['A?', 'B?', 'C?'],
        },
        'en-US',
      ),
    ).resolves.toMatchObject({ unavailable: ['douyin'], cards: [{ id: 'youtube:one' }] });
  });
});
