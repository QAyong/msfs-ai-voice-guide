import type { SearchInput, SearchProviderName } from './types.js';

export type SearchProviderConfig = {
  provider: SearchProviderName;
  apiKey: string;
  endpoint: string;
  timeoutMs: number;
};

export type SearchProviderDocument = {
  rank: number;
  title?: string | undefined;
  siteName?: string | undefined;
  url?: string | undefined;
  summary?: string | undefined;
  content?: string | undefined;
  iconUrl?: string | undefined;
  thumbnailUrl?: string | undefined;
  publishTime?: string | undefined;
};

export type SearchProviderResponse = {
  requestId?: string | undefined;
  documents: SearchProviderDocument[];
};

export type SearchProviderErrorCode =
  'api_error' | 'http_error' | 'invalid_response' | 'timeout' | 'network_error';

export class SearchProviderError extends Error {
  readonly code: SearchProviderErrorCode;
  readonly requestId: string | undefined;

  constructor(code: SearchProviderErrorCode, requestId?: string) {
    super(code);
    this.name = 'SearchProviderError';
    this.code = code;
    this.requestId = requestId;
  }
}

export interface SearchProvider {
  search(input: SearchInput, signal?: AbortSignal): Promise<SearchProviderResponse>;
}

export type SearchFetch = typeof fetch;

export async function fetchSearchResponse(
  fetchImplementation: SearchFetch,
  endpoint: string,
  timeoutMs: number,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  try {
    return await fetchImplementation(endpoint, {
      ...init,
      signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
    });
  } catch (error) {
    throw new SearchProviderError(
      error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout' : 'network_error',
    );
  }
}
