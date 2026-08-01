import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envText = readFileSync(resolve('.env'), 'utf8');
for (const line of envText.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx <= 0) continue;
  const key = trimmed.slice(0, idx).trim();
  let value = trimmed.slice(idx + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (!(key in process.env)) process.env[key] = value;
}

const { ExploreService } = await import('../src/explore/service.ts');
const { EncyclopediaService } = await import('../src/explore/encyclopedia/service.ts');
const { WikipediaProvider } = await import('../src/explore/encyclopedia/wikipedia.ts');
const { BaiduBaikeSearchPageProvider } = await import('../src/explore/encyclopedia/baidu-baike.ts');
const { Qihoo360BaikeSearchPageProvider } =
  await import('../src/explore/encyclopedia/qihoo-360-baike.ts');
const { VideoService } = await import('../src/explore/video/service.ts');
const { BilibiliSearchPageProvider } = await import('../src/explore/video/bilibili.ts');
const { YouTubeProvider } = await import('../src/explore/video/youtube.ts');
const { SearchService } = await import('../src/search/service.ts');
const { loadSearchConfig } = await import('../src/config/schema.ts');
const { DeepSeekExplorePlanner } = await import('../src/providers/llm/deepseek-explore.ts');

const apiKey = process.env.DEEPSEEK_API_KEY;
const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const model = process.env.DEEPSEEK_LLM_MODEL || 'deepseek-chat';
if (!apiKey) {
  console.error('Missing DEEPSEEK_API_KEY');
  process.exit(1);
}

const service = new ExploreService(
  new DeepSeekExplorePlanner({ apiKey, baseUrl, model }),
  new EncyclopediaService([
    new WikipediaProvider(),
    new BaiduBaikeSearchPageProvider(),
    new Qihoo360BaikeSearchPageProvider(),
  ]),
  new VideoService([
    new YouTubeProvider(new SearchService(loadSearchConfig())),
    new BilibiliSearchPageProvider(),
  ]),
);

const conversation = [
  { role: 'user', text: '我们现在飞到长沙附近了，帮我介绍一下这座城市。' },
  { role: 'assistant', text: '长沙是湖南省会，湘江穿城而过，岳麓山、橘子洲都是很有代表性的地标。' },
  { role: 'user', text: '我想多了解长沙的历史文化、著名景点和本地美食。' },
  {
    role: 'assistant',
    text: '可以重点看看岳麓书院、橘子洲头、太平街，还有臭豆腐、糖油粑粑这些本地味道。',
  },
];

const preferencesVariants = [
  { name: 'default-wikipedia-youtube', encyclopedia: 'wikipedia', videoPlatforms: ['youtube'] },
  { name: 'baidu-360', encyclopedia: 'baidu_baike', videoPlatforms: ['bilibili'] },
];

for (const pref of preferencesVariants) {
  console.log(`\n===== RUN: ${pref.name} =====`);
  const started = Date.now();
  try {
    const result = await service.explore({
      recentConversation: conversation,
      preferences: {
        encyclopedia: pref.encyclopedia,
        videoPlatforms: pref.videoPlatforms,
      },
      locale: 'zh-CN',
    });
    const elapsedMs = Date.now() - started;
    console.log(
      JSON.stringify(
        {
          elapsedMs,
          topicCount: result.topics.length,
          suggestedPrompts: result.suggestedPrompts,
          unavailableProviders: result.unavailableProviders,
          topics: result.topics.map((topic) => ({
            id: topic.id,
            title: topic.title,
            reason: topic.reason,
            cards: topic.cards.map((card) => ({
              kind: card.kind,
              title: card.title,
              siteName: card.siteName,
              url: card.url,
              author: card.author,
              summary: card.summary,
            })),
          })),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(`FAILED ${pref.name} after ${Date.now() - started}ms`);
    console.error(error);
  }
}
