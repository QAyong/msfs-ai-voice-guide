import { SearchPageEncyclopediaProvider } from './search-page.js';

/** Builds a Wikipedia search-page card without making a Wikipedia API request. */
export class WikipediaSearchPageProvider extends SearchPageEncyclopediaProvider {
  constructor() {
    super({
      id: 'wikipedia',
      siteName: (locale) => (locale === 'en-US' ? 'Wikipedia · Search' : 'Wikipedia · 搜索主题'),
      allowedHosts: ['zh.wikipedia.org', 'en.wikipedia.org'],
      buildSearchUrl: (query, locale) => {
        const url = new URL(
          locale === 'zh-CN'
            ? 'https://zh.wikipedia.org/w/index.php'
            : 'https://en.wikipedia.org/w/index.php',
        );
        url.searchParams.set('search', query);
        return url;
      },
    });
  }
}
