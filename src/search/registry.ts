import type { SearchFetch, SearchProvider, SearchProviderConfig } from './provider.js';
import { BochaSearchProvider } from './providers/bocha.js';
import { VolcengineSearchProvider } from './providers/volcengine.js';

export function createSearchProvider(
  config: SearchProviderConfig,
  fetchImplementation: SearchFetch = fetch,
): SearchProvider {
  switch (config.provider) {
    case 'bocha':
      return new BochaSearchProvider(config, fetchImplementation);
    case 'volcengine':
      return new VolcengineSearchProvider(config, fetchImplementation);
  }
}
