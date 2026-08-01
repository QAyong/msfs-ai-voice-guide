import { exploreCardSchema, type ExploreCard } from '../../../shared/explore-contracts.js';
import { createSearchPageCard, type SearchPageEncyclopediaOptions } from './search-page.js';
import type { EncyclopediaCandidate, EncyclopediaProvider } from './provider.js';

type FetchLike = typeof fetch;

type BaikeLink = {
  title: string;
  url: string;
};

const searchPageOptions: SearchPageEncyclopediaOptions = {
  id: '360_baike',
  siteName: '360百科 · 搜索主题',
  allowedHosts: ['baike.so.com'],
  buildSearchUrl: (query) => {
    const url = new URL('https://baike.so.com/search/');
    url.searchParams.set('q', query);
    return url;
  },
};

const normalizeText = (value: string) =>
  decodeHtmlEntities(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/[_\-—–·•:：,，。！？!?()[\]【】]/g, '')
    .replace(/360百科/gi, '')
    .replace(/\s+/g, '')
    .normalize('NFKC')
    .toLocaleLowerCase();

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));

const titleWithoutMetadata = (value: string) =>
  decodeHtmlEntities(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/(?:[_\-—–]\s*)?360百科.*$/i, '')
    .replace(/\s*[(（][^()（）]*[)）]\s*$/g, '')
    .trim();

const extractBaikeLinks = (html: string, searchUrl: URL): BaikeLink[] => {
  const links: BaikeLink[] = [];
  const anchorPattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1];
    const rawTitle = match[2];
    if (!href || rawTitle === undefined) continue;

    let url: URL;
    try {
      url = new URL(decodeHtmlEntities(href), searchUrl);
    } catch {
      continue;
    }
    if (
      url.protocol !== 'https:' ||
      url.hostname.toLowerCase() !== 'baike.so.com' ||
      !/^\/doc\/\d+-\d+\.html$/i.test(url.pathname)
    ) {
      continue;
    }
    links.push({
      title: decodeHtmlEntities(rawTitle)
        .replace(/<[^>]*>/g, ' ')
        .trim(),
      url: url.toString(),
    });
  }
  return links;
};

const scoreLink = (link: BaikeLink, names: string[]) => {
  const title = normalizeText(link.title);
  const baseTitle = normalizeText(titleWithoutMetadata(link.title));
  let best = 0;
  for (const name of names) {
    const normalizedName = normalizeText(name);
    if (!normalizedName) continue;
    if (baseTitle === normalizedName) best = Math.max(best, 100);
    else if (baseTitle === `${normalizedName}市`) best = Math.max(best, 98);
    else if (title === normalizedName) best = Math.max(best, 96);
    else if (title.startsWith(`${normalizedName}市`)) best = Math.max(best, 80);
    else if (title.startsWith(normalizedName)) best = Math.max(best, 70 - title.length / 100);
    else if (title.includes(normalizedName)) best = Math.max(best, 30 - title.length / 100);
  }
  return best;
};

const resolveDirectLink = (candidate: EncyclopediaCandidate, html: string, searchUrl: URL) => {
  const names = [candidate.query, ...candidate.alternateNames];
  return extractBaikeLinks(html, searchUrl)
    .map((link) => ({ link, score: scoreLink(link, names) }))
    .filter((item) => item.score > 0)
    .sort(
      (left, right) => right.score - left.score || left.link.title.length - right.link.title.length,
    )[0]?.link;
};

const createDirectCard = (
  candidate: EncyclopediaCandidate,
  link: BaikeLink,
): ExploreCard | null => {
  const card = exploreCardSchema.safeParse({
    id: `360_baike:${candidate.topicId}`,
    kind: 'encyclopedia',
    topicId: candidate.topicId,
    title: titleWithoutMetadata(link.title) || candidate.query.trim(),
    siteName: '360百科',
    sourceType: 'direct',
    url: link.url,
  });
  return card.success ? card.data : null;
};

/** Resolves 360百科's search result to a real /doc/ entry before falling back to search. */
export class Qihoo360BaikeSearchPageProvider implements EncyclopediaProvider {
  readonly id = '360_baike' as const;

  constructor(private readonly fetchImplementation: FetchLike = fetch) {}

  async find(
    candidate: EncyclopediaCandidate,
    _locale: 'zh-CN' | 'en-US',
    signal?: AbortSignal,
  ): Promise<ExploreCard | null> {
    const fallback = createSearchPageCard(candidate, {
      ...searchPageOptions,
      kind: 'encyclopedia',
    });
    if (!fallback) return null;
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const searchUrl = new URL(fallback.url);
    try {
      const response = await this.fetchImplementation(searchUrl, {
        headers: { Accept: 'text/html', 'Accept-Language': 'zh-CN,zh;q=0.9' },
        ...(signal ? { signal } : {}),
      });
      if (!response.ok) return fallback;
      const directLink = resolveDirectLink(candidate, await response.text(), searchUrl);
      return directLink ? (createDirectCard(candidate, directLink) ?? fallback) : fallback;
    } catch (error) {
      if (signal?.aborted) throw error;
      return fallback;
    }
  }
}
