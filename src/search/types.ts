export type SearchSource = {
  rank: number;
  title: string;
  siteName: string;
  url: string;
  openMode: 'in_app';
  summary?: string;
  content?: string;
  iconUrl?: string;
  thumbnailUrl?: string;
  publishTime?: string;
};

export type SearchSuccess = {
  status: 'ok';
  requestId?: string;
  sources: SearchSource[];
};

export type SearchNoResults = {
  status: 'no_results';
  requestId?: string;
  sources: [];
};

export type SearchLowConfidence = {
  status: 'low_confidence';
  requestId?: string;
  sources: [];
};

export type SearchFailure = {
  status: 'error';
  code: 'api_error' | 'http_error' | 'invalid_response' | 'timeout' | 'network_error';
  requestId?: string;
  sources: [];
};

export type SearchResult = SearchSuccess | SearchNoResults | SearchLowConfidence | SearchFailure;
