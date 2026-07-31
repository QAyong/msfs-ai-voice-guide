import { SearchPageEncyclopediaProvider } from './search-page.js';

export class DouyinBaikeSearchPageProvider extends SearchPageEncyclopediaProvider {
  constructor() {
    super({
      id: 'douyin_baike',
      siteName: '抖音百科 / 快懂百科 · 搜索主题',
      allowedHosts: ['www.baike.com', 'baike.com'],
      buildSearchUrl: (query) => {
        const url = new URL('https://www.baike.com/search');
        url.searchParams.set('keyword', query);
        url.searchParams.set('activeTab', 'DOC_TAB');
        return url;
      },
    });
  }
}
