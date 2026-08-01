import { describe, expect, it } from 'vitest';
import { sourceWindowStateSchema } from '../../shared/source-preview.js';

const preview = {
  type: 'guide.sources' as const,
  query: '苏黎世湖',
  sources: [
    {
      rank: 1,
      title: '苏黎世湖',
      siteName: 'Example',
      url: 'https://example.com/zurich',
      openMode: 'in_app' as const,
    },
  ],
};

describe('source preview window state', () => {
  it.each(['preview', 'loading', 'ready'] as const)('accepts the %s state', (mode) => {
    const value =
      mode === 'preview'
        ? { mode, preview }
        : {
            mode,
            preview,
            source: preview.sources[0]!,
            currentUrl: preview.sources[0]!.url,
            pageZoomPercent: 100,
            readingMode: 'mobile',
          };
    expect(sourceWindowStateSchema.safeParse(value).success).toBe(true);
  });

  it('requires actionable details for an HTTP failure', () => {
    expect(
      sourceWindowStateSchema.safeParse({
        mode: 'error',
        preview,
        source: preview.sources[0]!,
        currentUrl: preview.sources[0]!.url,
        pageZoomPercent: 100,
        readingMode: 'mobile',
        error: 'http',
        message: '网站返回了 HTTP 406。',
        statusCode: 406,
      }).success,
    ).toBe(true);
    expect(
      sourceWindowStateSchema.safeParse({
        mode: 'error',
        preview,
        source: preview.sources[0],
        currentUrl: 'http://example.com',
        error: 'http',
        message: '',
      }).success,
    ).toBe(false);
  });

  it('accepts an HTTP page as an in-app source', () => {
    const httpSource = {
      ...preview.sources[0]!,
      url: 'http://example.com/legacy',
    };
    expect(
      sourceWindowStateSchema.safeParse({
        mode: 'ready',
        preview: { ...preview, sources: [httpSource] },
        source: httpSource,
        currentUrl: httpSource.url,
        pageZoomPercent: 110,
        readingMode: 'desktop',
      }).success,
    ).toBe(true);
  });

  it('requires a stepped page zoom percent on remote page states', () => {
    expect(
      sourceWindowStateSchema.safeParse({
        mode: 'ready',
        preview,
        source: preview.sources[0]!,
        currentUrl: preview.sources[0]!.url,
        readingMode: 'mobile',
      }).success,
    ).toBe(false);
    expect(
      sourceWindowStateSchema.safeParse({
        mode: 'loading',
        preview,
        source: preview.sources[0]!,
        currentUrl: preview.sources[0]!.url,
        pageZoomPercent: 105,
        readingMode: 'mobile',
      }).success,
    ).toBe(false);
  });

  it('keeps explore previews distinct from guide sources while allowing their cards to open safely', () => {
    const explore = {
      type: 'explore.result' as const,
      result: {
        schemaVersion: 1 as const,
        generatedAt: '2026-07-30T00:00:00.000Z',
        topics: [
          {
            id: 'one',
            title: '塞纳河',
            reason: '与当前对话有关。',
            cards: [
              {
                id: 'wiki:seine',
                kind: 'encyclopedia' as const,
                topicId: 'one',
                title: '塞纳河',
                siteName: 'Wikipedia',
                url: 'https://zh.wikipedia.org/wiki/%E5%A1%9E%E7%BA%B3%E6%B2%B3',
              },
            ],
          },
          { id: 'two', title: '巴黎', reason: '相关地点。', cards: [] },
          { id: 'three', title: '埃菲尔铁塔', reason: '代表性地标。', cards: [] },
        ],
        suggestedPrompts: ['为什么巴黎沿河发展？', '从空中怎么看塞纳河？', '附近还有什么地标？'],
        unavailableProviders: [],
      },
    };
    expect(sourceWindowStateSchema.safeParse({ mode: 'preview', preview: explore }).success).toBe(
      true,
    );
    expect(
      sourceWindowStateSchema.safeParse({
        mode: 'ready',
        preview: explore,
        source: {
          rank: 1,
          title: '塞纳河',
          siteName: 'Wikipedia',
          url: 'https://zh.wikipedia.org/wiki/%E5%A1%9E%E7%BA%B3%E6%B2%B3',
          openMode: 'in_app',
        },
        currentUrl: 'https://zh.wikipedia.org/wiki/%E5%A1%9E%E7%BA%B3%E6%B2%B3',
        pageZoomPercent: 100,
        readingMode: 'mobile',
      }).success,
    ).toBe(true);
  });
});
