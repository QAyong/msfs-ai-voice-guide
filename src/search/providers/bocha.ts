import { z } from 'zod';
import type {
  SearchFetch,
  SearchProvider,
  SearchProviderConfig,
  SearchProviderResponse,
} from '../provider.js';
import { SearchProviderError, fetchSearchResponse } from '../provider.js';
import type { SearchInput } from '../types.js';

const webPageSchema = z
  .object({
    name: z.string().nullish(),
    url: z.string().nullish(),
    snippet: z.string().nullish(),
    summary: z.string().nullish(),
    siteName: z.string().nullish(),
    siteIcon: z.string().nullish(),
    datePublished: z.string().nullish(),
  })
  .passthrough();

const webPagesSchema = z.object({
  webSearchUrl: z.string().nullish(),
  totalEstimatedMatches: z.number().nullish(),
  value: z.array(webPageSchema).nullish(),
});

const searchDataSchema = z
  .object({
    _type: z.string().optional(),
    queryContext: z.unknown().optional(),
    webPages: webPagesSchema.nullish(),
  })
  .passthrough();

const apiResponseSchema = z
  .object({
    code: z.union([z.string(), z.number()]).nullish(),
    success: z.boolean().nullish(),
    message: z.string().nullish(),
    msg: z.string().nullable().optional(),
    data: searchDataSchema.nullish(),
    webPages: webPagesSchema.nullish(),
  })
  .passthrough();

export class BochaSearchProvider implements SearchProvider {
  readonly #config: SearchProviderConfig;
  readonly #fetch: SearchFetch;

  constructor(config: SearchProviderConfig, fetchImplementation: SearchFetch = fetch) {
    this.#config = config;
    this.#fetch = fetchImplementation;
  }

  async search(input: SearchInput, signal?: AbortSignal): Promise<SearchProviderResponse> {
    const response = await fetchSearchResponse(
      this.#fetch,
      this.#config.endpoint,
      this.#config.timeoutMs,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.#config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: input.query,
          freshness: 'noLimit',
          summary: true,
          count: 10,
        }),
      },
      signal,
    );

    if (!response.ok) throw new SearchProviderError('http_error');

    const parsed = await parseResponse(response);
    if (!parsed) throw new SearchProviderError('invalid_response');

    const responseCode = parsed.code == null ? undefined : String(parsed.code);
    const searchData = parsed.data ?? parsed;
    if (
      parsed.success === false ||
      (searchData.webPages === undefined && responseCode !== undefined && responseCode !== '200')
    ) {
      throw new SearchProviderError('api_error');
    }

    return {
      documents: (searchData.webPages?.value ?? []).map((page, index) => ({
        rank: index + 1,
        title: page.name ?? undefined,
        siteName: page.siteName ?? undefined,
        url: page.url ?? undefined,
        summary: page.summary ?? page.snippet ?? undefined,
        iconUrl: page.siteIcon ?? undefined,
        publishTime: page.datePublished ?? undefined,
      })),
    };
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
