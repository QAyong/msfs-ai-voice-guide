import { SearchPageVideoProvider } from './search-page.js';

export class BilibiliSearchPageProvider extends SearchPageVideoProvider {
  constructor() {
    super({
      id: 'bilibili',
      siteName: (locale) => (locale === 'en-US' ? 'Bilibili · Site search' : '哔哩哔哩 · 站内搜索'),
      allowedHosts: ['search.bilibili.com'],
      buildSearchUrl: (query) => {
        const url = new URL('https://search.bilibili.com/all');
        url.searchParams.set('keyword', query);
        return url;
      },
    });
  }
}
