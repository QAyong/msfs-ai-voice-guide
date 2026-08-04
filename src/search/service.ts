import { z } from 'zod';
import type { SearchProviderConfig, SearchProviderDocument } from './provider.js';
import { SearchProviderError } from './provider.js';
import { createSearchProvider } from './registry.js';
import type {
  SearchFailure,
  SearchLowConfidence,
  SearchNoResults,
  SearchResult,
  SearchSource,
  SearchSuccess,
} from './types.js';
import type { SearchInput } from './types.js';

const MAX_EVIDENCE_LENGTH = 4_000;

const searchInputSchema = z.object({
  query: z.string().trim().min(2).max(500),
  site: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i, '必须是域名')
    .optional(),
});

export type SearchServiceConfig = Omit<SearchProviderConfig, 'provider'> & {
  /** Defaults to Volcengine for backwards compatibility with existing callers. */
  provider?: SearchProviderConfig['provider'];
};
export type FetchLike = typeof fetch;

export class SearchService {
  readonly #provider: ReturnType<typeof createSearchProvider>;

  constructor(config: SearchServiceConfig, fetchImplementation: FetchLike = fetch) {
    this.#provider = createSearchProvider(
      {
        ...config,
        provider: config.provider ?? 'volcengine',
      },
      fetchImplementation,
    );
  }

  async search(input: SearchInput, signal?: AbortSignal): Promise<SearchResult> {
    const { query, site } = searchInputSchema.parse(input);
    try {
      const result = await this.#provider.search({ query, ...(site ? { site } : {}) }, signal);
      const requestId = result.requestId;
      const sources = normalizeSources(result.documents);
      if (sources.length === 0) {
        return noResults(requestId);
      }
      const relevantSources = sources.filter((source) => isRelevant(source, query, site));
      const minimumSourceCount = site ? 1 : 2;
      if (relevantSources.length < minimumSourceCount) {
        return lowConfidence(requestId);
      }
      return success(sortBySourceQuality(relevantSources), requestId);
    } catch (error) {
      if (error instanceof SearchProviderError) {
        return failure(error.code, error.requestId);
      }
      throw error;
    }
  }
}

function normalizeSources(results: SearchProviderDocument[]): SearchSource[] {
  const seenUrls = new Set<string>();
  const sources: SearchSource[] = [];
  for (const result of results) {
    const url = normalizeUrl(result.url);
    const summary = cleanText(result.summary);
    const content = cleanText(result.content);
    if (!url || (!summary && !content) || seenUrls.has(url)) {
      continue;
    }
    seenUrls.add(url);
    const hostname = new URL(url).hostname;
    const iconUrl = normalizeMediaUrl(result.iconUrl);
    const thumbnailUrl = normalizeMediaUrl(result.thumbnailUrl);
    const publishTime = cleanText(result.publishTime);
    sources.push({
      rank: result.rank,
      title: cleanText(result.title) ?? hostname,
      siteName: cleanText(result.siteName) ?? hostname,
      url,
      openMode: 'in_app',
      ...(summary ? { summary } : {}),
      ...(content ? { content } : {}),
      ...(iconUrl ? { iconUrl } : {}),
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      ...(publishTime ? { publishTime } : {}),
    });
  }
  return sources;
}

function normalizeMediaUrl(value: string | undefined): string | undefined {
  return normalizeUrl(value);
}

function normalizeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith('utm_')) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function cleanText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, MAX_EVIDENCE_LENGTH) : undefined;
}

function isRelevant(source: SearchSource, query: string, requiredSite?: string): boolean {
  const hostname = new URL(source.url).hostname;
  if (requiredSite && hostname !== requiredSite && !hostname.endsWith(`.${requiredSite}`)) {
    return false;
  }
  const searchableText = [source.title, source.siteName, source.summary, source.content, source.url]
    .filter((value): value is string => value !== undefined)
    .join(' ')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase();
  return meaningfulTerms(query).some((term) => searchableText.includes(term));
}

function meaningfulTerms(query: string): string[] {
  const ignoredLatinTerms = new Set([
    'about',
    'archaeological',
    'complex',
    'history',
    'kingdom',
    'main',
    'major',
    'pyramids',
    'site',
    'the',
    'and',
    'with',
  ]);
  const latinTerms = query
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .match(/[a-z][a-z0-9-]{2,}/g)
    ?.filter((term) => !ignoredLatinTerms.has(term));
  if (latinTerms && latinTerms.length > 0) return latinTerms;

  const genericTerms = new Set([
    '历史',
    '文化',
    '主要',
    '建筑',
    '关系',
    '介绍',
    '什么',
    '哪些',
    '时间',
    '地方',
  ]);
  const cjkSequences = query.match(/[\u3400-\u9fff]+/g) ?? [];
  return [...new Set(cjkSequences.flatMap(twoCharacterTerms))].filter(
    (term) => !genericTerms.has(term),
  );
}

function twoCharacterTerms(value: string): string[] {
  return Array.from({ length: Math.max(0, value.length - 1) }, (_, index) =>
    value.slice(index, index + 2),
  );
}

function sortBySourceQuality(sources: SearchSource[]): SearchSource[] {
  return [...sources].sort((left, right) => sourceQuality(right) - sourceQuality(left));
}

function sourceQuality(source: SearchSource): number {
  const hostname = new URL(source.url).hostname;
  if (
    hostname.endsWith('.gov.cn') ||
    hostname.endsWith('.edu.cn') ||
    hostname.endsWith('.edu') ||
    hostname.endsWith('.museum') ||
    hostname.endsWith('unesco.org')
  ) {
    return 1;
  }
  return 0;
}

function success(sources: SearchSource[], requestId?: string): SearchSuccess {
  return { status: 'ok', ...(requestId ? { requestId } : {}), sources };
}

function noResults(requestId?: string): SearchNoResults {
  return { status: 'no_results', ...(requestId ? { requestId } : {}), sources: [] };
}

function lowConfidence(requestId?: string): SearchLowConfidence {
  return { status: 'low_confidence', ...(requestId ? { requestId } : {}), sources: [] };
}

function failure(code: SearchFailure['code'], requestId?: string): SearchFailure {
  return { status: 'error', code, ...(requestId ? { requestId } : {}), sources: [] };
}
