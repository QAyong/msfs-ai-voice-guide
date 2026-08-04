import { BaiduBaikeSearchPageProvider } from '../src/explore/encyclopedia/baidu-baike.js';
import { WikipediaProvider } from '../src/explore/encyclopedia/wikipedia.js';
import { BilibiliSearchPageProvider } from '../src/explore/video/bilibili.js';
import { YouTubeSearchPageProvider } from '../src/explore/video/youtube.js';

const timeout = async <T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs = 15_000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timer);
  }
};

const topic = { topicId: 'eiffel-tower', query: '埃菲尔铁塔', alternateNames: ['Eiffel Tower'] };
const videoTopic = { topicId: 'eiffel-tower', query: 'Eiffel Tower Paris travel guide' };
const youtubeProvider = new YouTubeSearchPageProvider();

const probes = {
  wikipedia: () => new WikipediaProvider().find(topic, 'zh-CN'),
  baiduBaike: () => new BaiduBaikeSearchPageProvider().find(topic, 'zh-CN'),
  youtube: () => youtubeProvider.find(videoTopic, 'en-US'),
  bilibili: () =>
    new BilibiliSearchPageProvider().find(
      { ...videoTopic, query: '埃菲尔铁塔 巴黎 旅行' },
      'zh-CN',
    ),
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
