import { describe, expect, it } from 'vitest';
import { guideSourcesTopic, parseGuideSourcesMessage } from '../../shared/guide-events.js';

describe('guide source events', () => {
  it('keeps application source cards on their own data topic', () => {
    expect(guideSourcesTopic).toBe('msfs.guide.sources');
    expect(
      parseGuideSourcesMessage(
        JSON.stringify({
          type: 'guide.sources',
          query: '苏黎世湖',
          sources: [
            {
              rank: 1,
              title: '苏黎世湖',
              siteName: 'Example',
              url: 'https://example.com/zurich',
              openMode: 'in_app',
            },
          ],
        }),
      ),
    ).toMatchObject({ type: 'guide.sources', sources: [{ title: '苏黎世湖' }] });
  });

  it('allows HTTP only as external and rejects unsafe or mismatched payloads', () => {
    expect(parseGuideSourcesMessage('not-json')).toBeNull();
    expect(
      parseGuideSourcesMessage(
        JSON.stringify({
          type: 'guide.sources',
          sources: [
            {
              rank: 1,
              title: 'HTTP 来源',
              siteName: 'Example',
              url: 'http://example.com',
              openMode: 'external',
            },
          ],
        }),
      ),
    ).not.toBeNull();
    expect(
      parseGuideSourcesMessage(
        JSON.stringify({
          type: 'guide.sources',
          sources: [
            {
              rank: 1,
              title: 'bad',
              siteName: 'bad',
              url: 'http://example.com',
              openMode: 'in_app',
            },
          ],
        }),
      ),
    ).toBeNull();
    expect(
      parseGuideSourcesMessage(
        JSON.stringify({
          type: 'guide.sources',
          sources: [
            {
              rank: 1,
              title: 'bad',
              siteName: 'bad',
              url: 'javascript:alert(1)',
              openMode: 'external',
            },
          ],
        }),
      ),
    ).toBeNull();
  });
});
