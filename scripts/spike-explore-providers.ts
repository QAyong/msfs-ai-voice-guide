import { DuckDuckGoDiscoveryProvider } from '../src/explore/discovery/duckduckgo.js';
import { BaiduBaikeSearchPageProvider } from '../src/explore/encyclopedia/baidu-baike.js';
import { DouyinBaikeSearchPageProvider } from '../src/explore/encyclopedia/douyin-baike.js';
import { WikipediaProvider } from '../src/explore/encyclopedia/wikipedia.js';
import { DouyinSearchPageProvider } from '../src/explore/video/douyin-search-page.js';
import { YouTubeProvider } from '../src/explore/video/youtube.js';
import { WebDiscoveryVideoProvider } from '../src/explore/video/web-discovery.js';

const timeout = async <T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs = 15_000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timer);
  }
};

const discovery = new DuckDuckGoDiscoveryProvider();
const topic = { topicId: 'eiffel-tower', query: '埃菲尔铁塔', alternateNames: ['Eiffel Tower'] };
const videoTopic = { topicId: 'eiffel-tower', query: 'Eiffel Tower Paris travel guide' };

const probes = {
  wikipedia: () => new WikipediaProvider().find(topic, 'zh-CN'),
  baiduBaike: () => new BaiduBaikeSearchPageProvider().find(topic, 'zh-CN'),
  douyinBaike: () => new DouyinBaikeSearchPageProvider().find(topic, 'zh-CN'),
  youtube: () => new YouTubeProvider().find(videoTopic, 'en-US'),
  tiktok: () =>
    new WebDiscoveryVideoProvider(discovery, {
      id: 'tiktok',
      siteName: 'TikTok',
      domains: ['tiktok.com'],
      enrichWithTikTokOEmbed: true,
    }).find(videoTopic, 'en-US'),
  douyin: () =>
    new DouyinSearchPageProvider().find({ ...videoTopic, query: '埃菲尔铁塔 巴黎 旅行' }, 'zh-CN'),
};

const results = [];
for (const [provider, probe] of Object.entries(probes)) {
  const startedAt = Date.now();
  try {
    const result = await timeout(() => probe());
    const cards = Array.isArray(result) ? result : result ? [result] : [];
    results.push({
      provider,
      ok: true,
      elapsedMs: Date.now() - startedAt,
      cards: cards.map((card) => ({ title: card.title, url: card.url, siteName: card.siteName })),
    });
  } catch (error) {
    results.push({
      provider,
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message.slice(0, 180) : 'unknown error',
    });
  }
}

console.log(JSON.stringify({ executedAt: new Date().toISOString(), results }, null, 2));
