import { describe, expect, it } from 'vitest';
import { loadSearchConfig } from '../../src/config/schema.js';
import { SearchService } from '../../src/search/service.js';

const describeWithSearchKey = process.env.VOLCENGINE_SEARCH_API_KEY ? describe : describe.skip;

describeWithSearchKey('Volcengine Search Custom API smoke', () => {
  const createService = () => new SearchService(loadSearchConfig());
  const validCases = [
    ['国内历史', '北京故宫的始建时间、历史沿革和主要建筑'],
    ['国内偏门文化', '青海同仁热贡艺术的历史和主要传承寺院'],
    ['国内地方地理', '云南沙溪古镇茶马古道历史和白族文化'],
    ['非洲地点', '纳米比亚科尔曼斯科普废弃小镇的历史'],
    ['南美洲遗址', '秘鲁库埃拉普遗址与查查波亚文化的关系'],
    ['英文资料', 'Meroe pyramids history Nubian Kingdom'],
  ] as const;

  it.each(validCases)(
    '%s：返回至少两条经过过滤的来源',
    async (_name, query) => {
      const result = await createService().search({ query });

      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        expect(result.sources.length).toBeGreaterThanOrEqual(2);
        expect(
          result.sources.every((source) => source.url && Boolean(source.summary || source.content)),
        ).toBe(true);
      }
    },
    20_000,
  );

  it('拒绝指定站点下主题跑偏的结果', async () => {
    const result = await createService().search({
      query: 'Kuélap archaeological complex history',
      site: 'whc.unesco.org',
    });

    expect(result).toMatchObject({ status: 'low_confidence', sources: [] });
  }, 20_000);

  it('拒绝虚构地点返回的无关结果', async () => {
    const result = await createService().search({ query: '完全不存在的虚构地点 XYZ-987654' });

    expect(result).toMatchObject({ status: 'low_confidence', sources: [] });
  }, 20_000);
});
