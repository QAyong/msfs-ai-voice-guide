import { ConfigError, loadConfig } from '../../src/config/schema.js';
import type { AppConfig } from '../../src/config/schema.js';
import type { DesktopReadiness } from '../../shared/desktop-contracts.js';
import { localizeDesktopText, type DesktopLocale } from '../../shared/desktop-locale.js';

export type ConfigurationResult =
  { ok: true; config: AppConfig } | { ok: false; readiness: DesktopReadiness };

const localizeConfigurationIssue = (issue: string, locale: DesktopLocale): string => {
  if (locale !== 'en-US') return issue;
  return issue
    .replaceAll('必须是 ws:// 或 wss:// URL', 'Must be a ws:// or wss:// URL')
    .replaceAll('必须使用 https: URL', 'Must use an https: URL')
    .replaceAll('必须使用 wss: URL', 'Must use a wss: URL')
    .replaceAll('环境配置', 'Environment configuration')
    .replaceAll('：', ': ');
};

const splitIssues = (message: string) =>
  message
    .replace(/^环境配置无效：\s*/u, '')
    .split(/\r?\n/u)
    .map((issue) => issue.trim())
    .filter(Boolean);

export function checkDesktopConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
  locale: DesktopLocale = 'zh-CN',
): ConfigurationResult {
  try {
    return { ok: true, config: loadConfig(environment) };
  } catch (error) {
    if (error instanceof ConfigError) {
      return {
        ok: false,
        readiness: {
          status: 'setup_required',
          message: localizeDesktopText(
            locale,
            'Required services are not configured. Open settings to configure them.',
            '未配置服务，请配置服务。',
          ),
          issues: splitIssues(error.message).map((issue) =>
            localizeConfigurationIssue(issue, locale),
          ),
        },
      };
    }

    return {
      ok: false,
      readiness: {
        status: 'error',
        message: localizeDesktopText(
          locale,
          'An error occurred while reading the local configuration.',
          '读取本地配置时发生错误。',
        ),
        issues: [
          localizeDesktopText(
            locale,
            'Check the .env file format and try again.',
            '请检查 .env 文件格式后重试。',
          ),
        ],
      },
    };
  }
}

export const localizeReadinessDetail = (detail: string, locale: DesktopLocale): string => {
  const portMatch = detail.match(/(?:127\.0\.0\.1|localhost):(\d+)/iu);
  if (/EADDRINUSE|address already in use/iu.test(detail)) {
    const port = portMatch?.[1] ?? '';
    return localizeDesktopText(
      locale,
      `Local service port${port ? ` ${port}` : ''} is already in use; an older process may still be running.`,
      `本地服务端口${port ? ` ${port} ` : ''}已被占用，可能有旧进程仍未退出。`,
    );
  }
  const normalizedDetail = detail.replaceAll(/127\.0\.0\.1:(\d+)/gu, '本机端口 $1');
  if (locale !== 'en-US') return detail;
  return normalizedDetail
    .replaceAll(
      '等待 LiveKit Worker 就绪超时',
      'Timed out waiting for the LiveKit worker to become ready',
    )
    .replaceAll('AI Worker 健康检查端口尚未就绪。', 'The AI worker health-check port is not ready.')
    .replaceAll(
      'LiveKit 服务不可用，或 Worker 尚未完成注册。请确认 LiveKit Server 已启动。',
      'LiveKit is unavailable or the worker has not registered. Confirm that the LiveKit server is running.',
    )
    .replaceAll('无法分配本地 TCP 端口。', 'Unable to allocate a local TCP port.')
    .replaceAll('无法分配本地 LiveKit 端口。', 'Unable to allocate a local LiveKit port.')
    .replaceAll(
      '未找到本地 LiveKit Server。请检查应用安装资源是否完整。',
      'The local LiveKit server was not found. Check that the app resources are complete.',
    )
    .replaceAll('本地 LiveKit Server 未能启动。', 'The local LiveKit server could not start.')
    .replaceAll('AI Worker 未能在重启前退出。', 'The AI worker did not exit before restart.')
    .replaceAll(
      '本地 LiveKit Server 未能在重启前退出。',
      'The local LiveKit server did not exit before restart.',
    )
    .replaceAll('AI Worker 健康检查未通过（HTTP ', 'AI worker health check failed (HTTP ')
    .replaceAll('）。', ').')
    .replaceAll('[已隐藏]', '[redacted]');
};

export function workerFailureReadiness(
  error: unknown,
  locale: DesktopLocale = 'zh-CN',
): DesktopReadiness {
  const detail = error instanceof Error ? error.message : String(error);
  const safeDetail = detail
    .replaceAll(/(api[_ -]?key|secret|token)\s*[=:]\s*\S+/giu, '$1=[已隐藏]')
    .slice(0, 320);
  const isPortConflict = /EADDRINUSE|address already in use/iu.test(safeDetail);
  return {
    status: 'error',
    message: localizeDesktopText(
      locale,
      isPortConflict
        ? 'The AI worker port is already in use.'
        : 'The AI service did not connect to LiveKit.',
      isPortConflict ? 'AI Worker 端口已被占用。' : 'AI 服务没有成功连接到 LiveKit。',
    ),
    issues: safeDetail
      ? [localizeReadinessDetail(safeDetail, locale)]
      : [
          localizeDesktopText(
            locale,
            'Check that the LiveKit service is running, then try again.',
            '请检查 LiveKit 服务是否已启动，然后重试。',
          ),
        ],
  };
}

export function localLiveKitFailureReadiness(
  error: unknown,
  locale: DesktopLocale = 'zh-CN',
): DesktopReadiness {
  const detail = error instanceof Error ? error.message : String(error);
  const safeDetail = detail
    .replaceAll(/(api[_ -]?key|secret|token)\s*[=:]\s*\S+/giu, '$1=[已隐藏]')
    .slice(0, 320);
  return {
    status: 'error',
    message: localizeDesktopText(
      locale,
      'The local LiveKit service could not start.',
      '本地 LiveKit 服务未能启动。',
    ),
    issues: safeDetail
      ? [localizeReadinessDetail(safeDetail, locale)]
      : [
          localizeDesktopText(
            locale,
            'Check that the app local real-time components are complete, then try again.',
            '请检查应用本地实时组件是否完整，然后重试。',
          ),
        ],
  };
}
