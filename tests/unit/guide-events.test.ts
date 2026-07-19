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
              title: '苏黎世湖',
              siteName: 'Example',
              url: 'https://example.com/zurich',
            },
          ],
        }),
      ),
    ).toMatchObject({ type: 'guide.sources', sources: [{ title: '苏黎世湖' }] });
  });

  it('rejects invalid or insecure source payloads', () => {
    expect(parseGuideSourcesMessage('not-json')).toBeNull();
    expect(
      parseGuideSourcesMessage(
        JSON.stringify({
          type: 'guide.sources',
          sources: [{ title: 'bad', siteName: 'bad', url: 'http://example.com' }],
        }),
      ),
    ).toBeNull();
  });
});
