#!/usr/bin/env node
/* global AbortSignal, URL, fetch */

const endpoint =
  process.env.VOLCENGINE_SEARCH_CUSTOM_ENDPOINT ??
  'https://open.feedcoopapi.com/search_api/web_search';
const apiKey = process.env.VOLCENGINE_SEARCH_API_KEY;
const args = process.argv.slice(2);

const cases = [
  {
    id: 'cn-history',
    query: '北京故宫的始建时间、历史沿革和主要建筑',
    expectation: '国内历史知识，返回正文和可引用来源',
    relevanceTerms: ['故宫', '紫禁城'],
  },
  {
    id: 'cn-niche-culture',
    query: '青海同仁热贡艺术的历史和主要传承寺院',
    expectation: '国内偏门人文地理内容',
    relevanceTerms: ['热贡', '同仁', 'reb gong'],
  },
  {
    id: 'cn-local-geography',
    query: '云南沙溪古镇茶马古道历史和白族文化',
    expectation: '国内地方文化和地理资料',
    relevanceTerms: ['沙溪', '茶马古道'],
  },
  {
    id: 'global-africa',
    query: '纳米比亚科尔曼斯科普废弃小镇的历史',
    expectation: '非洲非主流地点',
    relevanceTerms: ['科尔曼斯科普', '科尔芒斯科普', 'kolmanskop'],
  },
  {
    id: 'global-south-america',
    query: '秘鲁库埃拉普遗址与查查波亚文化的关系',
    expectation: '南美洲历史和考古内容',
    relevanceTerms: ['库埃拉普', '库拉普', 'kuelap', 'chachapoyas'],
  },
  {
    id: 'global-english',
    query: 'Meroe pyramids history Nubian Kingdom',
    expectation: '英文关键词和非亚洲内容',
    relevanceTerms: ['meroe', '麦罗埃', '梅罗埃', 'nubian', '努比亚', 'kush', '库施'],
  },
  {
    id: 'site-filter',
    query: 'Kuélap archaeological complex history',
    expectation: '站点过滤，仅返回 UNESCO 页面或无结果',
    filter: { Sites: 'whc.unesco.org' },
    requireSite: 'whc.unesco.org',
    relevanceTerms: ['kuélap', 'kuelap', '库埃拉普', '库拉普'],
    minRelevantSources: 1,
  },
  {
    id: 'no-result',
    query: '完全不存在的虚构地点 XYZ-987654',
    expectation: '无结果时不虚构内容',
    expectNoResult: true,
  },
];

function getOption(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function selectedCases() {
  const caseId = getOption('--case');
  const query = getOption('--query');

  if (query) {
    return [{ id: 'custom', query, expectation: '自定义查询' }];
  }
  if (caseId) {
    const testCase = cases.find((item) => item.id === caseId);
    if (!testCase) {
      throw new Error(
        `未知测试用例：${caseId}。可选值：${cases.map((item) => item.id).join(', ')}`,
      );
    }
    return [testCase];
  }
  return cases;
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function summarizeResult(body) {
  const metadataError = body?.ResponseMetadata?.Error;
  const result = body?.Result;
  const webResults = Array.isArray(result?.WebResults) ? result.WebResults : [];
  const sources = webResults.map((item) => ({
    title: item?.Title ?? '',
    site: item?.SiteName ?? '',
    url: item?.Url ?? '',
    host: hostOf(item?.Url ?? ''),
    publishTime: item?.PublishTime ?? '',
    authority: item?.AuthInfoDes ?? '',
    authorityLevel: item?.AuthInfoLevel ?? null,
    rankScore: item?.RankScore ?? null,
    summaryLength: typeof item?.Summary === 'string' ? item.Summary.length : 0,
    contentLength: typeof item?.Content === 'string' ? item.Content.length : 0,
    _searchText: [item?.Title, item?.SiteName, item?.Summary, item?.Content, item?.Url]
      .filter((value) => typeof value === 'string')
      .join(' ')
      .toLowerCase(),
  }));

  return {
    requestId: body?.ResponseMetadata?.RequestId ?? '',
    error: metadataError ?? (result?.ErrorCode ? result?.ErrorMsg : undefined),
    resultCount: result?.ResultCount ?? webResults.length,
    sources,
    timeCostMs: result?.TimeCost ?? null,
  };
}

async function runCase(testCase) {
  const startedAt = Date.now();
  const body = {
    Query: testCase.query,
    SearchType: 'web',
    Count: 10,
    Filter: {
      NeedContent: true,
      NeedUrl: true,
      ...(testCase.filter ?? {}),
    },
    ContentFormats: 'markdown',
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  const responseText = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error(`返回内容不是 JSON，HTTP ${response.status}`);
  }

  const summary = summarizeResult(parsed);
  const usableSources = summary.sources.filter(
    (source) => source.url && (source.summaryLength > 0 || source.contentLength > 0),
  );
  const filterPassed =
    !testCase.requireSite ||
    usableSources.every(
      (source) =>
        source.host === testCase.requireSite || source.host.endsWith(`.${testCase.requireSite}`),
    );
  const relevanceTerms = (testCase.relevanceTerms ?? []).map((term) => term.toLowerCase());
  const relevantSourceCount = relevanceTerms.length
    ? usableSources.filter((source) =>
        relevanceTerms.some((term) => source._searchText.includes(term)),
      ).length
    : usableSources.length;
  const minRelevantSources = testCase.minRelevantSources ?? Math.min(2, usableSources.length);
  const passed = testCase.expectNoResult
    ? response.ok && !summary.error && summary.resultCount === 0
    : response.ok &&
      !summary.error &&
      usableSources.length >= 2 &&
      relevantSourceCount >= minRelevantSources &&
      filterPassed;

  return {
    id: testCase.id,
    query: testCase.query,
    expectation: testCase.expectation,
    passed,
    httpStatus: response.status,
    elapsedMs: Date.now() - startedAt,
    ...summary,
    returnedSourceCount: summary.sources.length,
    usableSourceCount: usableSources.length,
    relevantSourceCount,
    minRelevantSources,
    filterPassed,
    sources: summary.sources.slice(0, 3).map((source) => {
      const output = { ...source };
      delete output._searchText;
      return output;
    }),
  };
}

async function main() {
  if (!apiKey) {
    throw new Error('缺少 VOLCENGINE_SEARCH_API_KEY；请通过环境变量传入，不要把 Key 写入脚本。');
  }

  const testCases = selectedCases();
  const results = [];
  for (const testCase of testCases) {
    try {
      results.push(await runCase(testCase));
    } catch (error) {
      results.push({
        id: testCase.id,
        query: testCase.query,
        expectation: testCase.expectation,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const passedCount = results.filter((item) => item.passed).length;
  process.stdout.write(
    `${JSON.stringify(
      {
        endpoint,
        total: results.length,
        passed: passedCount,
        failed: results.length - passedCount,
        results,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
