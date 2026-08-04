import type { SearchProviderName } from './types.js';

export const defaultSearchTimeoutMs = 10_000;
export const defaultSearchEndpointByProvider: Record<SearchProviderName, string> = {
  volcengine: 'https://open.feedcoopapi.com/search_api/web_search',
  bocha: 'https://api.bochaai.com/v1/web-search',
};
