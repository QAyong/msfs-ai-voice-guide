import { describe, expect, it } from 'vitest';
import {
  guideSourcesTopic,
  guideToolEventsTopic,
  parseGuideSourcesMessage,
  parseGuideToolEvent,
} from '../../shared/guide-events.js';

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

  it('opens HTTP in the app and rejects unsupported protocols or external mode', () => {
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
              openMode: 'in_app',
              iconUrl: 'http://example.com/favicon.ico',
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
              title: '外部模式',
              siteName: 'Example',
              url: 'http://example.com',
              openMode: 'external',
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

  it('publishes tool diagnostics as a constrained summary without call arguments or output', () => {
    expect(guideToolEventsTopic).toBe('msfs.guide.tool-events');
    expect(
      parseGuideToolEvent(
        JSON.stringify({
          type: 'guide.tools',
          tools: [{ name: 'searchWeb', isError: false }],
        }),
      ),
    ).toEqual({ type: 'guide.tools', tools: [{ name: 'searchWeb', isError: false }] });
    expect(
      parseGuideToolEvent(
        JSON.stringify({
          type: 'guide.tools',
          tools: [{ name: 'searchWeb', isError: false, arguments: 'not allowed' }],
        }),
      ),
    ).toBeNull();
  });
});
