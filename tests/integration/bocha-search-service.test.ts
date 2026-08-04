import { describe, expect, it } from 'vitest';
import { SearchService } from '../../src/search/service.js';

const serviceConfig = {
  provider: 'bocha' as const,
  apiKey: 'bocha-test-key',
  endpoint: 'https://api.bochaai.com/v1/web-search',
  timeoutMs: 100,
};

describe('Bocha SearchService adapter', () => {
  it('发送博查 Web Search 请求并映射 Bing 兼容网页结果', async () => {
    const service = new SearchService(serviceConfig, async (_input, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        query: '北京故宫历史',
        freshness: 'noLimit',
        summary: true,
        count: 10,
      });
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer bocha-test-key');
      return Response.json({
        code: 200,
        data: {
          _type: 'SearchResponse',
          queryContext: { originalQuery: '北京故宫历史' },
          webPages: {
            totalEstimatedMatches: 12,
            value: [
              {
                name: '故宫博物院历史',
                url: 'https://www.dpm.org.cn/about?utm_source=test#history',
                siteName: '故宫博物院',
                siteIcon: 'https://www.dpm.org.cn/favicon.ico',
                snippet: '<b>北京故宫</b>的历史资料。',
                datePublished: '2026-07-15T00:00:00+08:00',
              },
              {
                name: '北京故宫建筑沿革',
                url: 'https://history.example.edu/gugong',
                siteName: '历史研究院',
                summary: '北京故宫历史与主要建筑沿革。',
                datePublished: null,
              },
            ],
          },
        },
      });
    });

    await expect(service.search({ query: '北京故宫历史' })).resolves.toEqual({
      status: 'ok',
      sources: [
        {
          rank: 2,
          title: '北京故宫建筑沿革',
          siteName: '历史研究院',
          url: 'https://history.example.edu/gugong',
          openMode: 'in_app',
          summary: '北京故宫历史与主要建筑沿革。',
        },
        {
          rank: 1,
          title: '故宫博物院历史',
          siteName: '故宫博物院',
          url: 'https://www.dpm.org.cn/about',
          openMode: 'in_app',
          summary: '北京故宫 的历史资料。',
          iconUrl: 'https://www.dpm.org.cn/favicon.ico',
          publishTime: '2026-07-15T00:00:00+08:00',
        },
      ],
    });
  });

  it('将博查 API 错误转换为统一搜索错误状态', async () => {
    const service = new SearchService(serviceConfig, async () =>
      Response.json({ success: false, code: '401', message: 'unauthorized' }),
    );

    await expect(service.search({ query: '北京故宫' })).resolves.toEqual({
      status: 'error',
      code: 'api_error',
      sources: [],
    });
  });
});
