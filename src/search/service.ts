import { z } from 'zod';
import type { AppConfig } from '../config/schema.js';
import type {
  SearchFailure,
  SearchLowConfidence,
  SearchNoResults,
  SearchResult,
  SearchSource,
  SearchSuccess,
} from './types.js';

const MAX_EVIDENCE_LENGTH = 4_000;

const webResultSchema = z.object({
  Title: z.string().optional(),
  SiteName: z.string().optional(),
  Url: z.string().optional(),
  Summary: z.string().optional(),
  Content: z.string().optional(),
  PublishTime: z.string().optional(),
});

const globalDocumentSchema = z.object({
  Rank: z.number().int().nonnegative().optional(),
  Url: z.string().optional(),
  Title: z.string().optional(),
  HostInfo: z
    .object({
      Hostname: z.string().optional(),
      IconUrl: z.string().optional(),
    })
    .optional(),
  DocumentInfo: z
    .object({
      PublishTime: z.string().optional(),
    })
    .optional(),
  Snippets: z
    .array(
      z.object({
        Text: z.string().optional(),
        Image: z
          .object({
            Url: z.string().optional(),
            ImageUrl: z.string().optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

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

const apiResponseSchema = z
  .object({
    ResponseMetadata: z
      .object({
        RequestId: z.string().optional(),
        Error: z.unknown().optional(),
      })
      .optional(),
    Result: z
      .object({
        ErrorCode: z.unknown().optional(),
        WebResults: z.array(webResultSchema).optional(),
        GlobalSearchResp: z
          .object({
            Documents: z.array(globalDocumentSchema).optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .passthrough();

export type SearchInput = z.input<typeof searchInputSchema>;
export type SearchServiceConfig = Omit<AppConfig['search'], 'apiKey'> & { apiKey: string };
export type FetchLike = typeof fetch;

export class SearchService {
  readonly #config: SearchServiceConfig;
  readonly #fetch: FetchLike;

  constructor(config: SearchServiceConfig, fetchImplementation: FetchLike = fetch) {
    this.#config = config;
    this.#fetch = fetchImplementation;
  }

  async search(input: SearchInput): Promise<SearchResult> {
    const { query, site } = searchInputSchema.parse(input);
    let response: Response;

    try {
      response = await this.#fetch(this.#config.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.#config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Query: query,
          SearchType: 'web',
          Count: 10,
          Filter: {
            NeedContent: true,
            NeedUrl: true,
            ...(site ? { Sites: site } : {}),
          },
          ContentFormats: 'markdown',
        }),
        signal: AbortSignal.timeout(this.#config.timeoutMs),
      });
    } catch (error) {
      return failure(
        error instanceof DOMException && error.name === 'TimeoutError'
          ? 'timeout'
          : 'network_error',
      );
    }

    if (!response.ok) {
      return failure('http_error');
    }

    const parsed = await parseResponse(response);
    if (!parsed) {
      return failure('invalid_response');
    }

    const requestId = parsed.ResponseMetadata?.RequestId;
    if (parsed.ResponseMetadata?.Error !== undefined || parsed.Result?.ErrorCode !== undefined) {
      return failure('api_error', requestId);
    }

    const sources = normalizeSources([
      ...(parsed.Result?.WebResults ?? []).map((result, index) => ({
        rank: index + 1,
        title: result.Title,
        siteName: result.SiteName,
        url: result.Url,
        summary: result.Summary,
        content: result.Content,
        publishTime: result.PublishTime,
      })),
      ...(parsed.Result?.GlobalSearchResp?.Documents ?? []).map((document, index) => ({
        rank: document.Rank ?? index + 1,
        title: document.Title,
        siteName: document.HostInfo?.Hostname,
        url: document.Url,
        summary: document.Snippets?.find((snippet) => cleanText(snippet.Text))?.Text,
        iconUrl: document.HostInfo?.IconUrl,
        thumbnailUrl: document.Snippets?.map(
          (snippet) => snippet.Image?.Url ?? snippet.Image?.ImageUrl,
        ).find((url) => normalizeMediaUrl(url)),
        publishTime: document.DocumentInfo?.PublishTime,
      })),
    ]);
    if (sources.length === 0) {
      return noResults(requestId);
    }
    const relevantSources = sources.filter((source) => isRelevant(source, query, site));
    const minimumSourceCount = site ? 1 : 2;
    if (relevantSources.length < minimumSourceCount) {
      return lowConfidence(requestId);
    }
    return success(sortBySourceQuality(relevantSources), requestId);
  }
}

async function parseResponse(
  response: Response,
): Promise<z.infer<typeof apiResponseSchema> | undefined> {
  try {
    return apiResponseSchema.parse(await response.json());
  } catch {
    return undefined;
  }
}

function normalizeSources(
  results: Array<{
    rank: number;
    title?: string | undefined;
    siteName?: string | undefined;
    url?: string | undefined;
    summary?: string | undefined;
    content?: string | undefined;
    iconUrl?: string | undefined;
    thumbnailUrl?: string | undefined;
    publishTime?: string | undefined;
  }>,
): SearchSource[] {
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
