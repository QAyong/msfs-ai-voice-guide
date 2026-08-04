import { SafeSearchType, search } from 'duck-duck-scrape';
import { RequestGate } from '../request-gate.js';
import type { WebDiscoveryProvider, WebDiscoveryResult } from './provider.js';

const normaliseHost = (value: string) => value.toLowerCase().replace(/^www\./u, '');
const allowedHost = (hostname: string, domains: readonly string[]) =>
  domains.some((domain) => {
    const expected = normaliseHost(domain);
    const actual = normaliseHost(hostname);
    return actual === expected || actual.endsWith(`.${expected}`);
  });

const stripMarkup = (value: string) => value.replace(/<[^>]*>/gu, '').trim();

/**
 * Free, non-official web discovery. Results are immediately restricted to a caller-owned
 * domain allowlist, keeping volatile search behaviour outside each content provider.
 */
export class DuckDuckGoDiscoveryProvider implements WebDiscoveryProvider {
  private readonly gate = new RequestGate(1_500);
  private readonly cache = new Map<string, { expiresAt: number; results: WebDiscoveryResult[] }>();

  async search(
    query: string,
    options: { domains: readonly string[]; locale: 'zh-CN' | 'en-US' },
    signal?: AbortSignal,
  ): Promise<WebDiscoveryResult[]> {
    const cacheKey = `${options.locale}:${options.domains.join(',')}:${query}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.results;
    const results = await this.gate.run(async () => {
      const response = await search(query, {
        safeSearch: SafeSearchType.MODERATE,
        locale: options.locale === 'zh-CN' ? 'zh-cn' : 'en-us',
      });
      return response.results.flatMap((result) => {
        try {
          const url = new URL(result.url);
          if (
            !['http:', 'https:'].includes(url.protocol) ||
            !allowedHost(url.hostname, options.domains)
          ) {
            return [];
          }
          return [
            {
              title: stripMarkup(result.title),
              url: url.toString(),
              hostname: url.hostname,
              ...(result.rawDescription ? { description: stripMarkup(result.rawDescription) } : {}),
            },
          ];
        } catch {
          return [];
        }
      });
    }, signal);
    this.cache.set(cacheKey, { expiresAt: Date.now() + 5 * 60_000, results });
    return results;
  }
}
