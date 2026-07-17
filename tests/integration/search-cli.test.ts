import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cliPath = fileURLToPath(new URL('../../src/cli/search.ts', import.meta.url));

type CliResult = { exitCode: number | null; stdout: string; stderr: string };

async function runCli(endpoint: string, args: string[]): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', cliPath, ...args], {
      env: {
        ...process.env,
        VOLCENGINE_SEARCH_API_KEY: 'cli-test-key',
        VOLCENGINE_SEARCH_CUSTOM_ENDPOINT: endpoint,
        VOLCENGINE_SEARCH_TIMEOUT_MS: '1000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

async function withSearchServer(
  responseBody: unknown,
  run: (endpoint: string, authorization: () => string | undefined) => Promise<void>,
): Promise<void> {
  let receivedAuthorization: string | undefined;
  const server = createServer((request, response) => {
    receivedAuthorization = request.headers.authorization;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(responseBody));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('测试服务器未取得端口');
  try {
    await run(`http://127.0.0.1:${address.port}/search`, () => receivedAuthorization);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

describe('search CLI', () => {
  it('输出 JSON 并复用搜索服务的请求和过滤逻辑', async () => {
    await withSearchServer(
      {
        Result: {
          WebResults: [
            {
              Title: '故宫博物院介绍',
              Url: 'https://www.dpm.org.cn/about',
              Summary: '北京故宫历史资料',
            },
            {
              Title: '故宫建筑',
              Url: 'https://www.dpm.org.cn/explore',
              Summary: '北京故宫建筑与历史',
            },
          ],
        },
      },
      async (endpoint, authorization) => {
        const result = await runCli(endpoint, ['--', '--query', '北京故宫历史', '--json']);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        expect(JSON.parse(result.stdout)).toMatchObject({ status: 'ok' });
        expect(authorization()).toBe('Bearer cli-test-key');
      },
    );
  });

  it('低相关性使用非零退出码且不输出 Key', async () => {
    await withSearchServer(
      {
        Result: {
          WebResults: [
            { Url: 'https://example.test/paris', Summary: '巴黎旅游资料' },
            { Url: 'https://example.test/london', Summary: '伦敦旅游资料' },
          ],
        },
      },
      async (endpoint) => {
        const result = await runCli(endpoint, ['--query', '虚构地点 XYZ-987654', '--json']);

        expect(result.exitCode).toBe(2);
        expect(JSON.parse(result.stdout)).toEqual({ status: 'low_confidence', sources: [] });
        expect(`${result.stdout}${result.stderr}`).not.toContain('cli-test-key');
      },
    );
  });
});
