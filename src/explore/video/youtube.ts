import { SearchPageVideoProvider } from './search-page.js';

/** Opens YouTube's public search UI without a backend search-provider dependency. */
export class YouTubeSearchPageProvider extends SearchPageVideoProvider {
  constructor() {
    super({
      id: 'youtube',
      siteName: (locale) => (locale === 'en-US' ? 'YouTube · Web search' : 'YouTube · 网页搜索'),
      allowedHosts: ['www.youtube.com'],
      buildSearchUrl: (query) => {
        const url = new URL('https://www.youtube.com/results');
        url.searchParams.set('search_query', query);
        return url;
      },
    });
  }
}
