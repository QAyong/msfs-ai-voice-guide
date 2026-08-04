import { exploreCardSchema, type ExploreCard } from '../../../shared/explore-contracts.js';
import { RequestGate } from '../request-gate.js';
import type { EncyclopediaCandidate, EncyclopediaProvider } from './provider.js';

type WikipediaSearchResponse = {
  pages?: Array<{
    id?: number;
    key?: string;
    title?: string;
    description?: string;
    thumbnail?: { url?: string };
  }>;
};

const endpointFor = (locale: 'zh-CN' | 'en-US') =>
  locale === 'zh-CN'
    ? 'https://zh.wikipedia.org/w/rest.php/v1/search/page'
    : 'https://en.wikipedia.org/w/rest.php/v1/search/page';

const normaliseWebUrl = (value: string | undefined) => {
  if (!value) return undefined;
  const candidate = value.startsWith('//') ? `https:${value}` : value;
  try {
    return ['http:', 'https:'].includes(new URL(candidate).protocol) ? candidate : undefined;
  } catch {
    return undefined;
  }
};

export class WikipediaProvider implements EncyclopediaProvider {
  readonly id = 'wikipedia' as const;
  private readonly gate = new RequestGate(150);

  async find(
    candidate: EncyclopediaCandidate,
    locale: 'zh-CN' | 'en-US',
    signal?: AbortSignal,
  ): Promise<ExploreCard | null> {
    const url = new URL(endpointFor(locale));
    url.searchParams.set('q', candidate.query);
    url.searchParams.set('limit', '1');
    const response = await this.gate.run(
      () =>
        fetch(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'MSFS-AI-Voice-Guide/0.1 (desktop exploration feature)',
          },
          ...(signal ? { signal } : {}),
        }),
      signal,
    );
    if (!response.ok) throw new Error(`Wikipedia HTTP ${response.status}`);
    const body = (await response.json()) as WikipediaSearchResponse;
    const page = body.pages?.[0];
    if (!page?.key || !page.title) return null;
    const language = locale === 'zh-CN' ? 'zh' : 'en';
    const pageUrl = `https://${language}.wikipedia.org/wiki/${encodeURIComponent(page.key)}`;
    const parsed = exploreCardSchema.safeParse({
      id: `wikipedia:${page.key}`,
      kind: 'encyclopedia',
      topicId: candidate.topicId,
      title: page.title,
      siteName: 'Wikipedia',
      url: pageUrl,
      ...(page.description ? { summary: page.description } : {}),
      ...(normaliseWebUrl(page.thumbnail?.url)
        ? { thumbnailUrl: normaliseWebUrl(page.thumbnail?.url) }
        : {}),
    });
    return parsed.success ? parsed.data : null;
  }
}
