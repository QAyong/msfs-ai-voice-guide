import { ConfigError, loadConfig } from '../../src/config/schema.js';
import type { AppConfig } from '../../src/config/schema.js';
import type { DesktopReadiness } from '../../shared/desktop-contracts.js';

export type ConfigurationResult =
  { ok: true; config: AppConfig } | { ok: false; readiness: DesktopReadiness };

const splitIssues = (message: string) =>
  message
    .replace(/^环境配置无效：\s*/u, '')
    .split(/\r?\n/u)
    .map((issue) => issue.trim())
    .filter(Boolean);

export function checkDesktopConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): ConfigurationResult {
  try {
    return { ok: true, config: loadConfig(environment) };
  } catch (error) {
    if (error instanceof ConfigError) {
      return {
        ok: false,
        readiness: {
          status: 'setup_required',
          message: '需要先完成本地服务配置。',
          issues: splitIssues(error.message),
        },
      };
    }

    return {
      ok: false,
      readiness: {
        status: 'error',
        message: '读取本地配置时发生错误。',
        issues: ['请检查 .env 文件格式后重试。'],
      },
    };
  }
}

export function workerFailureReadiness(error: unknown): DesktopReadiness {
  const detail = error instanceof Error ? error.message : String(error);
  const safeDetail = detail
    .replaceAll(/(api[_ -]?key|secret|token)\s*[=:]\s*\S+/giu, '$1=[已隐藏]')
    .slice(0, 320);
  return {
    status: 'error',
    message: 'AI 服务没有成功连接到 LiveKit。',
    issues: safeDetail ? [safeDetail] : ['请检查 LiveKit 服务是否已启动，然后重试。'],
  };
}
