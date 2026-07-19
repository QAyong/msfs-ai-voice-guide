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
            deviceMode: 'ipad',
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
        deviceMode: 'desktop',
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
        deviceMode: 'phone',
        error: 'http',
        message: '',
      }).success,
    ).toBe(false);
  });
});
