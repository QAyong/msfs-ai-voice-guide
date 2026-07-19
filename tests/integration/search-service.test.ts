import { describe, expect, it } from 'vitest';
import { SearchService } from '../../src/search/service.js';

const serviceConfig = {
  apiKey: 'not-a-real-key',
  endpoint: 'https://search.example.test/web',
  timeoutMs: 100,
};

describe('SearchService', () => {
  it('发送 Custom API 请求并清洗、去重可引用来源', async () => {
    const fetchMock: typeof fetch = async (_input, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        Query: '北京故宫历史',
        SearchType: 'web',
        Count: 10,
        Filter: { NeedContent: true, NeedUrl: true, Sites: 'dpm.org.cn' },
        ContentFormats: 'markdown',
      });
      return Response.json({
        ResponseMetadata: { RequestId: 'request-123' },
        Result: {
          WebResults: [
            {
              Title: '<b>故宫博物院</b>',
              SiteName: '故宫博物院',
              Url: 'https://www.dpm.org.cn/about?utm_source=test#history',
              Summary: '<p>北京 故宫\n历史</p>',
            },
            {
              Url: 'https://www.dpm.org.cn/about',
              Content: '这是重复来源',
            },
            {
              Title: '故宫文物藏品',
              SiteName: '故宫博物院',
              Url: 'https://www.dpm.org.cn/collection',
              Content: '北京故宫的历史文物藏品。',
            },
            { Url: 'invalid-url', Summary: '无效 URL' },
          ],
        },
      });
    };
    const service = new SearchService(serviceConfig, fetchMock);

    await expect(service.search({ query: '北京故宫历史', site: 'dpm.org.cn' })).resolves.toEqual({
      status: 'ok',
      requestId: 'request-123',
      sources: [
        {
          rank: 1,
          title: '故宫博物院',
          siteName: '故宫博物院',
          url: 'https://www.dpm.org.cn/about',
          openMode: 'in_app',
          summary: '北京 故宫 历史',
        },
        {
          rank: 3,
          title: '故宫文物藏品',
          siteName: '故宫博物院',
          url: 'https://www.dpm.org.cn/collection',
          openMode: 'in_app',
          content: '北京故宫的历史文物藏品。',
        },
      ],
    });
  });

  it('maps GlobalSearch documents into the single preview contract and keeps mixed protocols', async () => {
    const service = new SearchService(serviceConfig, async () =>
      Response.json({
        ResponseMetadata: { RequestId: 'global-1' },
        Result: {
          GlobalSearchResp: {
            TotalDocCount: 20,
            Documents: [
              {
                Rank: 7,
                Url: 'https://travel.example.test/zurich',
                Title: '苏黎世湖旅行指南',
                HostInfo: {
                  Hostname: '',
                  IconUrl: 'https://travel.example.test/favicon.ico',
                },
                DocumentInfo: { PublishTime: '2026-07-15' },
                Snippets: [
                  { Text: '<b>苏黎世湖</b>沿岸景点与历史。' },
                  { Image: { Url: 'https://travel.example.test/lake.jpg' } },
                ],
              },
              {
                Rank: 8,
                Url: 'http://legacy.example.test/zurich',
                Title: '苏黎世湖旧站资料',
                HostInfo: { Hostname: '旧站' },
                Snippets: [{ Text: '苏黎世湖历史资料。' }],
              },
              {
                Rank: 9,
                Url: 'javascript:alert(1)',
                Title: '坏来源',
                Snippets: [{ Text: '坏项' }],
              },
            ],
          },
        },
      }),
    );

    await expect(service.search({ query: '苏黎世湖历史' })).resolves.toEqual({
      status: 'ok',
      requestId: 'global-1',
      sources: [
        {
          rank: 7,
          title: '苏黎世湖旅行指南',
          siteName: 'travel.example.test',
          url: 'https://travel.example.test/zurich',
          openMode: 'in_app',
          summary: '苏黎世湖 沿岸景点与历史。',
          iconUrl: 'https://travel.example.test/favicon.ico',
          thumbnailUrl: 'https://travel.example.test/lake.jpg',
          publishTime: '2026-07-15',
        },
        {
          rank: 8,
          title: '苏黎世湖旧站资料',
          siteName: '旧站',
          url: 'http://legacy.example.test/zurich',
          openMode: 'in_app',
          summary: '苏黎世湖历史资料。',
        },
      ],
    });
  });

  it('不会将虚构地点或跑偏站点的结果交给回答层', async () => {
    const service = new SearchService(serviceConfig, async () =>
      Response.json({
        ResponseMetadata: { RequestId: 'off-topic' },
        Result: {
          WebResults: [
            {
              Title: '巴黎旅游指南',
              Url: 'https://travel.example.test/paris',
              Summary: '法国巴黎景点介绍',
            },
            {
              Title: '纽约历史',
              Url: 'https://travel.example.test/new-york',
              Summary: '纽约的城市发展历史',
            },
          ],
        },
      }),
    );

    await expect(service.search({ query: '完全不存在的虚构地点 XYZ-987654' })).resolves.toEqual({
      status: 'low_confidence',
      requestId: 'off-topic',
      sources: [],
    });
  });

  it('对空结果、HTTP 异常和非 JSON 响应返回可识别状态', async () => {
    const empty = new SearchService(serviceConfig, async () =>
      Response.json({ ResponseMetadata: { RequestId: 'empty' }, Result: { WebResults: [] } }),
    );
    const unavailable = new SearchService(
      serviceConfig,
      async () => new Response('down', { status: 503 }),
    );
    const invalid = new SearchService(serviceConfig, async () => new Response('not json'));

    await expect(empty.search({ query: '不存在的地点' })).resolves.toEqual({
      status: 'no_results',
      requestId: 'empty',
      sources: [],
    });
    await expect(unavailable.search({ query: '北京故宫' })).resolves.toEqual({
      status: 'error',
      code: 'http_error',
      sources: [],
    });
    await expect(invalid.search({ query: '北京故宫' })).resolves.toEqual({
      status: 'error',
      code: 'invalid_response',
      sources: [],
    });
  });

  it('区分 API 错误、超时和普通网络错误且不回显凭据', async () => {
    const apiError = new SearchService(serviceConfig, async () =>
      Response.json({
        ResponseMetadata: { RequestId: 'denied', Error: { Code: 'Unauthorized' } },
      }),
    );
    const timeout = new SearchService(serviceConfig, async () => {
      throw new DOMException('timed out', 'TimeoutError');
    });
    const networkError = new SearchService(serviceConfig, async () => {
      throw new Error('connection failed');
    });

    const results = await Promise.all([
      apiError.search({ query: '北京故宫' }),
      timeout.search({ query: '北京故宫' }),
      networkError.search({ query: '北京故宫' }),
    ]);

    expect(results).toEqual([
      { status: 'error', code: 'api_error', requestId: 'denied', sources: [] },
      { status: 'error', code: 'timeout', sources: [] },
      { status: 'error', code: 'network_error', sources: [] },
    ]);
    expect(JSON.stringify(results)).not.toContain(serviceConfig.apiKey);
  });

  it('指定站点时同时校验域名和主题实体', async () => {
    const service = new SearchService(serviceConfig, async () =>
      Response.json({
        Result: {
          WebResults: [
            {
              Title: 'Kuélap Archaeological Complex',
              Url: 'https://unrelated.example.test/kuelap',
              Summary: 'History of Kuélap in Peru.',
            },
            {
              Title: 'Machu Picchu',
              Url: 'https://whc.unesco.org/en/list/274',
              Summary: 'A famous archaeological complex and UNESCO World Heritage site in Peru.',
            },
          ],
        },
      }),
    );

    await expect(
      service.search({ query: 'Kuelap archaeological complex history', site: 'whc.unesco.org' }),
    ).resolves.toEqual({ status: 'low_confidence', sources: [] });
  });

  it('实体匹配兼容带重音和不带重音的地名', async () => {
    const service = new SearchService(serviceConfig, async () =>
      Response.json({
        Result: {
          WebResults: [
            {
              Title: 'Kuelap',
              Url: 'https://whc.unesco.org/en/tentativelists/6411',
              Summary: 'Kuelap is a fortified archaeological site in Peru.',
            },
          ],
        },
      }),
    );

    const result = await service.search({
      query: 'Kuélap archaeological complex history',
      site: 'whc.unesco.org',
    });

    expect(result.status).toBe('ok');
  });

  it('优先返回机构来源并截断过长正文', async () => {
    const service = new SearchService(serviceConfig, async () =>
      Response.json({
        Result: {
          WebResults: [
            {
              Title: '故宫民间介绍',
              Url: 'https://travel.example.test/gugong',
              Summary: '北京故宫历史概览',
            },
            {
              Title: '故宫研究资料',
              Url: 'https://history.example.edu/gugong',
              Content: `北京故宫${'资料'.repeat(3_000)}`,
            },
          ],
        },
      }),
    );

    const result = await service.search({ query: '北京故宫历史' });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.sources[0]?.url).toBe('https://history.example.edu/gugong');
      expect(result.sources[0]?.content).toHaveLength(4_000);
    }
  });
});
