import { ZodError } from 'zod';
import { ConfigError, loadSearchConfig } from '../config/schema.js';
import { SearchService } from '../search/service.js';
import type { SearchResult } from '../search/types.js';

type CliOptions = {
  query: string;
  site?: string;
  json: boolean;
};

function parseArguments(args: string[]): CliOptions {
  let query: string | undefined;
  let site: string | undefined;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') {
      continue;
    } else if (argument === '--json') {
      json = true;
    } else if (argument === '--query' || argument === '--site') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} 需要一个值`);
      if (argument === '--query') query = value;
      else site = value;
      index += 1;
    } else if (argument === '--help') {
      throw new Error('用法：pnpm run search -- --query "问题" [--site example.org] [--json]');
    } else {
      throw new Error(`未知参数：${argument}`);
    }
  }
  if (!query) throw new Error('缺少 --query');
  return { query, ...(site ? { site } : {}), json };
}

function formatHumanReadable(result: SearchResult): string {
  if (result.status === 'ok') {
    return result.sources
      .map((source, index) => {
        const evidence = source.summary ?? source.content ?? '';
        return `${index + 1}. ${source.title || source.siteName || '未命名来源'}\n${source.url}\n${evidence}`;
      })
      .join('\n\n');
  }
  if (result.status === 'no_results') return '没有找到可引用的资料。';
  if (result.status === 'low_confidence') return '没有找到足以可靠回答的相关资料。';
  return `搜索暂时不可用（${result.code}）。`;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const service = new SearchService(loadSearchConfig());
  const result = await service.search(options);
  process.stdout.write(`${options.json ? JSON.stringify(result) : formatHumanReadable(result)}\n`);
  if (result.status !== 'ok') process.exitCode = 2;
}

main().catch((error: unknown) => {
  const message =
    error instanceof ConfigError || error instanceof ZodError || error instanceof Error
      ? error.message
      : '搜索命令执行失败。';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
