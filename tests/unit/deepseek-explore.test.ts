import { describe, expect, it, vi } from 'vitest';
import { DeepSeekExplorePlanner } from '../../src/providers/llm/deepseek-explore.js';
import type { ExplorePlannerInput } from '../../src/explore/planner.js';

const input: ExplorePlannerInput = {
  recentConversation: [
    { role: 'user' as const, text: '我最近在长沙，想了解这里的历史、景点和文化。' },
  ],
  preferences: { encyclopedia: 'wikipedia', videoPlatforms: ['bilibili'] },
  locale: 'zh-CN' as const,
};

describe('DeepSeek explore planner', () => {
  it('runs topic, encyclopedia, video, and prompt roles with non-thinking mode', async () => {
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    const roles: string[] = [];
    let releaseParallelRequests: (() => void) | undefined;
    let resolveAllParallelRequests: (() => void) | undefined;
    const allParallelRequests = new Promise<void>((resolve) => {
      resolveAllParallelRequests = resolve;
    });
    const parallelRequestsReleased = new Promise<void>((resolve) => {
      releaseParallelRequests = resolve;
    });

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      activeRequests += 1;
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
      const body = JSON.parse(String(init?.body)) as {
        thinking?: { type?: string };
        messages?: Array<{ role: string; content: string }>;
      };
      expect(body.thinking).toEqual({ type: 'disabled' });
      expect(body.messages?.[0]?.role).toBe('system');
      const systemPrompt = body.messages?.[0]?.content ?? '';
      const role = systemPrompt.includes('topic planner')
        ? 'topics'
        : systemPrompt.includes('encyclopedia lookup')
          ? 'encyclopedia'
          : systemPrompt.includes('video search')
            ? 'video'
            : 'suggested-prompts';
      roles.push(role);

      try {
        if (role === 'topics') {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return Response.json({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    topics: [
                      { id: 'changsha', title: '长沙', reason: '了解城市整体背景。' },
                      { id: 'yuelu', title: '岳麓山', reason: '了解长沙的自然与文化地标。' },
                      { id: 'orange-island', title: '橘子洲', reason: '了解湘江与长沙城市记忆。' },
                    ],
                  }),
                },
              },
            ],
          });
        }

        if (roles.filter((value) => value !== 'topics').length === 3) {
          resolveAllParallelRequests?.();
        }
        await parallelRequestsReleased;

        const content =
          role === 'encyclopedia'
            ? {
                topics: [
                  {
                    topicId: 'changsha',
                    encyclopediaQuery: '长沙',
                    encyclopediaFallbackQueries: ['长沙市'],
                    alternateNames: [],
                  },
                  {
                    topicId: 'yuelu',
                    encyclopediaQuery: '岳麓山',
                    encyclopediaFallbackQueries: ['岳麓山风景名胜区'],
                    alternateNames: [],
                  },
                  {
                    topicId: 'orange-island',
                    encyclopediaQuery: '橘子洲',
                    encyclopediaFallbackQueries: [],
                    alternateNames: [],
                  },
                ],
              }
            : role === 'video'
              ? {
                  topics: [
                    { topicId: 'changsha', videoQuery: '长沙 历史 文化 旅游' },
                    { topicId: 'yuelu', videoQuery: '岳麓山 景点 介绍' },
                    { topicId: 'orange-island', videoQuery: '橘子洲 介绍' },
                  ],
                }
              : {
                  suggestedPrompts: [
                    '长沙有哪些历史遗迹？',
                    '岳麓山有什么文化故事？',
                    '橘子洲值得怎么游览？',
                  ],
                };
        return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
      } finally {
        activeRequests -= 1;
      }
    });

    const resultPromise = new DeepSeekExplorePlanner({
      apiKey: 'test-key',
      baseUrl: 'https://deepseek.example.test',
      model: 'deepseek-test-model',
    }).plan(input);

    await allParallelRequests;
    expect(roles.filter((value) => value !== 'topics').sort()).toEqual([
      'encyclopedia',
      'suggested-prompts',
      'video',
    ]);
    expect(maximumActiveRequests).toBe(3);
    releaseParallelRequests?.();

    await expect(resultPromise).resolves.toMatchObject({
      topics: [
        {
          id: 'changsha',
          title: '长沙',
          encyclopediaQuery: '长沙',
          videoQuery: '长沙 历史 文化 旅游',
        },
        { id: 'yuelu', encyclopediaQuery: '岳麓山', videoQuery: '岳麓山 景点 介绍' },
        { id: 'orange-island', encyclopediaQuery: '橘子洲', videoQuery: '橘子洲 介绍' },
      ],
      suggestedPrompts: ['长沙有哪些历史遗迹？', '岳麓山有什么文化故事？', '橘子洲值得怎么游览？'],
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
