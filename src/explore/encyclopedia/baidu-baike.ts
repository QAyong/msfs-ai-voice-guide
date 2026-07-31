import { SearchPageEncyclopediaProvider } from './search-page.js';

export class BaiduBaikeSearchPageProvider extends SearchPageEncyclopediaProvider {
  constructor() {
    super({
      id: 'baidu_baike',
      siteName: '百度百科 · 搜索主题',
      allowedHosts: ['baike.baidu.com'],
      buildSearchUrl: (query) => {
        const url = new URL('https://baike.baidu.com/search/word');
        url.searchParams.set('pic', '1');
        url.searchParams.set('sug', '1');
        url.searchParams.set('word', query);
        return url;
      },
    });
  }
}
