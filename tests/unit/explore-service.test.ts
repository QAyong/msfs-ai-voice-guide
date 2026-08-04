import { describe, expect, it } from 'vitest';
import { EncyclopediaService } from '../../src/explore/encyclopedia/service.js';
import type { ExplorePlanner } from '../../src/explore/planner.js';
import { ExploreService } from '../../src/explore/service.js';
import { VideoService } from '../../src/explore/video/service.js';

const plan = {
  topics: [
    {
      id: 'paris',
      title: '巴黎',
      reason: '对话主题。',
      encyclopediaQuery: '巴黎',
      encyclopediaFallbackQueries: [],
      videoQuery: '巴黎 旅行视频',
      alternateNames: [],
    },
    {
      id: 'seine',
      title: '塞纳河',
      reason: '相关地标。',
      encyclopediaQuery: '塞纳河',
      encyclopediaFallbackQueries: [],
      videoQuery: '塞纳河 视频',
      alternateNames: [],
    },
    {
      id: 'tower',
      title: '埃菲尔铁塔',
      reason: '代表性地标。',
      encyclopediaQuery: '埃菲尔铁塔',
      encyclopediaFallbackQueries: [],
      videoQuery: '埃菲尔铁塔 视频',
      alternateNames: [],
    },
  ],
  suggestedPrompts: ['巴黎为什么建在这里？', '塞纳河如何影响巴黎？', '从空中怎么看巴黎？'],
};

describe('ExploreService', () => {
  it('starts encyclopedia and video discovery in parallel after planning', async () => {
    let releaseEncyclopedia: (() => void) | undefined;
    const encyclopediaStarted = new Promise<void>((resolve) => {
      releaseEncyclopedia = resolve;
    });
    let videoStarted = false;
    const service = new ExploreService(
      { plan: async () => plan } as unknown as ExplorePlanner,
      {
        find: async () => {
          await encyclopediaStarted;
          return { cards: [], unavailable: false };
        },
      } as unknown as EncyclopediaService,
      {
        find: async () => {
          videoStarted = true;
          return { cards: [], unavailable: [] };
        },
      } as unknown as VideoService,
    );

    const result = service.explore({
      recentConversation: [{ role: 'user', text: '介绍巴黎' }],
      preferences: { encyclopedia: 'wikipedia', videoPlatforms: [] },
      locale: 'zh-CN',
    });
    await Promise.resolve();
    expect(videoStarted).toBe(true);
    releaseEncyclopedia?.();
    await expect(result).resolves.toEqual(
      expect.objectContaining({
        topics: expect.arrayContaining([expect.objectContaining({ id: 'paris' })]),
      }),
    );
  });

  it('returns video cards when the encyclopedia provider times out', async () => {
    const encyclopedia = new EncyclopediaService(
      [{ id: 'wikipedia', find: async () => new Promise<never>(() => undefined) }],
      { providerTimeoutMs: { wikipedia: 1 } },
    );
    const video = new VideoService([
      {
        id: 'bilibili',
        find: async (candidate) => [
          {
            id: `bilibili:${candidate.topicId}`,
            kind: 'video' as const,
            topicId: candidate.topicId,
            title: candidate.query,
            siteName: 'Bilibili',
            url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(candidate.query)}`,
          },
        ],
      },
    ]);
    const service = new ExploreService(
      { plan: async () => plan } as unknown as ExplorePlanner,
      encyclopedia,
      video,
    );

    const result = await service.explore({
      recentConversation: [{ role: 'user', text: '介绍巴黎' }],
      preferences: { encyclopedia: 'wikipedia', videoPlatforms: ['bilibili'] },
      locale: 'zh-CN',
    });
    expect(result.unavailableProviders).toEqual(['wikipedia']);
    expect(result.topics[0]?.cards).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'video' })]),
    );
  });
});
