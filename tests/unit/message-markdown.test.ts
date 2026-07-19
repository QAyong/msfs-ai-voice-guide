import { describe, expect, it } from 'vitest';
import { normalizeSecureMarkdownUrl } from '../../desktop/renderer/src/markdown-url.js';

describe('markdown link safety', () => {
  it('accepts HTTPS links', () => {
    expect(normalizeSecureMarkdownUrl('https://example.com/guide?q=1')).toBe(
      'https://example.com/guide?q=1',
    );
  });

  it.each(['http://example.com', 'javascript:alert(1)', 'data:text/html,test', '/relative'])(
    'rejects unsupported URL %s',
    (url) => {
      expect(normalizeSecureMarkdownUrl(url)).toBeNull();
    },
  );
});
