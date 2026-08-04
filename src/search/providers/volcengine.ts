import { z } from 'zod';
import type {
  SearchFetch,
  SearchProvider,
  SearchProviderConfig,
  SearchProviderResponse,
} from '../provider.js';
import { SearchProviderError, fetchSearchResponse } from '../provider.js';
import type { SearchInput } from '../types.js';

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

export class VolcengineSearchProvider implements SearchProvider {
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
          Query: input.query,
          SearchType: 'web',
          Count: 10,
          Filter: {
            NeedContent: true,
            NeedUrl: true,
            ...(input.site ? { Sites: input.site } : {}),
          },
          ContentFormats: 'markdown',
        }),
      },
      signal,
    );

    if (!response.ok) throw new SearchProviderError('http_error');

    const parsed = await parseResponse(response);
    if (!parsed) throw new SearchProviderError('invalid_response');

    const requestId = parsed.ResponseMetadata?.RequestId;
    if (parsed.ResponseMetadata?.Error !== undefined || parsed.Result?.ErrorCode !== undefined) {
      throw new SearchProviderError('api_error', requestId);
    }

    return {
      ...(requestId ? { requestId } : {}),
      documents: [
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
          ).find((url) => Boolean(url)),
          publishTime: document.DocumentInfo?.PublishTime,
        })),
      ],
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

function cleanText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || undefined;
}
