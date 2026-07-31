export type WebDiscoveryResult = {
  title: string;
  url: string;
  hostname: string;
  description?: string;
  thumbnailUrl?: string;
  author?: string;
  publishTime?: string;
};

export interface WebDiscoveryProvider {
  search(
    query: string,
    options: { domains: readonly string[]; locale: 'zh-CN' | 'en-US' },
    signal?: AbortSignal,
  ): Promise<WebDiscoveryResult[]>;
}
