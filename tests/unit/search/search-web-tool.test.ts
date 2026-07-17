import { describe, expect, it } from 'vitest';
import { SearchService } from '../../../src/search/service.js';
import { createSearchWebTool } from '../../../src/tools/search-web.js';

describe('searchWeb tool', () => {
  it('使用经校验的参数调用共享搜索服务', async () => {
    const requests: string[] = [];
    const service = new SearchService(
      {
        apiKey: 'test-key',
        endpoint: 'https://search.example.test/web',
        timeoutMs: 100,
      },
      async (_input, init) => {
        requests.push(String(init?.body));
        return Response.json({ Result: { WebResults: [] } });
      },
    );
    const tool = createSearchWebTool(service);

    const result = await tool.execute(
      { query: '北京故宫', site: 'dpm.org.cn' },
      undefined as never,
    );

    expect(tool.name).toBe('searchWeb');
    expect(tool.description).toContain('天气、新闻');
    expect(result).toEqual({ status: 'no_results', sources: [] });
    expect(JSON.parse(requests[0] ?? '{}')).toMatchObject({
      Query: '北京故宫',
      Filter: { Sites: 'dpm.org.cn' },
    });
  });
});
