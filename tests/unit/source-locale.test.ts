import { describe, expect, it } from 'vitest';
import {
  sourceAcceptLanguage,
  withSourceAcceptLanguage,
} from '../../desktop/main/source-locale.js';

describe('source page locale', () => {
  it('prefers English for remote pages in English mode', () => {
    expect(sourceAcceptLanguage('en-US')).toBe('en-US,en;q=0.9,zh-CN;q=0.5,zh;q=0.4');
  });

  it('replaces any existing language request header without altering other headers', () => {
    expect(
      withSourceAcceptLanguage(
        { Accept: 'text/html', 'accept-language': 'zh-CN,zh;q=0.9' },
        'en-US',
      ),
    ).toEqual({
      Accept: 'text/html',
      'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.5,zh;q=0.4',
    });
  });
});
