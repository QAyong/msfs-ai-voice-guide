import { randomUUID } from 'node:crypto';
import type WebSocket from 'ws';
import { type ServiceCheckResult, type ServiceCheckTarget } from '../../shared/desktop-settings.js';
import {
  createEventMessage,
  parseVolcengineMessage,
  VolcengineEvent,
  VolcengineMessageType,
} from '../../src/providers/volcengine/protocol.js';
import {
  closeWebSocket,
  connectWebSocket,
  readBinaryMessage,
} from '../../src/providers/volcengine/websocket.js';

const checkTimeoutMs = 10_000;
const minimumCheckIntervalMs = 2_500;

class ServiceCheckError extends Error {
  constructor(message: string) {
    super(message);
  }
}

const missingConfiguration = (target: ServiceCheckTarget): ServiceCheckResult => ({
  target,
  status: 'unavailable',
  message: '请先填写此服务所需的地址和凭据。',
});

const unavailable = (target: ServiceCheckTarget, message: string): ServiceCheckResult => ({
  target,
  status: 'unavailable',
  message,
});

function hasValues(environment: NodeJS.ProcessEnv, keys: readonly string[]): boolean {
  return keys.every((key) => Boolean(environment[key]?.trim()));
}

function modelListUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL('models', normalizedBaseUrl).toString();
}

function toSafeFailure(target: ServiceCheckTarget, error: unknown): ServiceCheckResult {
  if (error instanceof ServiceCheckError) return unavailable(target, error.message);
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return unavailable(target, '检测超时，请确认网络、服务地址后重试。');
  }
  if (error instanceof Error && /abort|cancel|timeout/i.test(error.message)) {
    return unavailable(target, '检测超时，请确认网络、服务地址后重试。');
  }
  return unavailable(target, '无法连接或验证此服务，请检查地址与凭据。');
}

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  return work(AbortSignal.timeout(checkTimeoutMs));
}

export class ServiceAvailabilityChecker {
  readonly #lastCheckAt = new Map<ServiceCheckTarget, number>();

  async check(
    target: ServiceCheckTarget,
    environment: NodeJS.ProcessEnv,
  ): Promise<ServiceCheckResult> {
    const now = Date.now();
    const lastCheckAt = this.#lastCheckAt.get(target);
    if (lastCheckAt !== undefined && now - lastCheckAt < minimumCheckIntervalMs) {
      return {
        target,
        status: 'rate_limited',
        message: '请稍候再试，避免向服务发送重复检测请求。',
      };
    }
    this.#lastCheckAt.set(target, now);

    try {
      switch (target) {
        case 'llm':
          await this.#checkLlm(environment);
          break;
        case 'stt':
          await this.#checkStt(environment);
          break;
        case 'tts':
          await this.#checkTts(environment);
          break;
        case 'search':
          await this.#checkSearch(environment);
          break;
      }
      return {
        target,
        status: 'available',
        message: '服务可用，地址与凭据验证通过。',
        latencyMs: Date.now() - now,
      };
    } catch (error) {
      return toSafeFailure(target, error);
    }
  }

  async #checkLlm(environment: NodeJS.ProcessEnv): Promise<void> {
    if (!hasValues(environment, ['DEEPSEEK_BASE_URL', 'DEEPSEEK_LLM_MODEL', 'DEEPSEEK_API_KEY'])) {
      throw new ServiceCheckError(missingConfiguration('llm').message);
    }
    const response = await withTimeout((signal) =>
      fetch(modelListUrl(environment.DEEPSEEK_BASE_URL!), {
        headers: { Authorization: `Bearer ${environment.DEEPSEEK_API_KEY}` },
        signal,
      }),
    );
    if (!response.ok)
      throw new ServiceCheckError('服务拒绝了检测请求，请检查 API Key 与账号权限。');
    const body: unknown = await response.json().catch(() => null);
    const models =
      body && typeof body === 'object' && 'data' in body && Array.isArray(body.data)
        ? body.data
        : null;
    if (!models) throw new ServiceCheckError('服务返回格式异常，请检查服务地址。');
    const configuredModel = environment.DEEPSEEK_LLM_MODEL!;
    const modelAvailable = models.some(
      (model) =>
        model && typeof model === 'object' && 'id' in model && model.id === configuredModel,
    );
    if (!modelAvailable) throw new ServiceCheckError('当前模型不在此 API Key 的可用模型列表中。');
  }

  async #checkStt(environment: NodeJS.ProcessEnv): Promise<void> {
    if (
      !hasValues(environment, [
        'VOLCENGINE_STT_ENDPOINT',
        'VOLCENGINE_STT_RESOURCE_ID',
        'VOLCENGINE_SPEECH_APP_ID',
        'VOLCENGINE_SPEECH_ACCESS_TOKEN',
      ])
    ) {
      throw new ServiceCheckError(missingConfiguration('stt').message);
    }
    let socket: WebSocket | undefined;
    try {
      socket = await withTimeout((signal) =>
        connectWebSocket(
          environment.VOLCENGINE_STT_ENDPOINT!,
          {
            'X-Api-App-Key': environment.VOLCENGINE_SPEECH_APP_ID!,
            'X-Api-Access-Key': environment.VOLCENGINE_SPEECH_ACCESS_TOKEN!,
            'X-Api-Resource-Id': environment.VOLCENGINE_STT_RESOURCE_ID!,
            'X-Api-Request-Id': randomUUID(),
            'X-Api-Connect-Id': randomUUID(),
            'X-Api-Sequence': '-1',
          },
          signal,
        ),
      );
    } finally {
      closeWebSocket(socket);
    }
  }

  async #checkTts(environment: NodeJS.ProcessEnv): Promise<void> {
    if (
      !hasValues(environment, [
        'VOLCENGINE_TTS_ENDPOINT',
        'VOLCENGINE_TTS_RESOURCE_ID',
        'VOLCENGINE_SPEECH_APP_ID',
        'VOLCENGINE_SPEECH_ACCESS_TOKEN',
      ])
    ) {
      throw new ServiceCheckError(missingConfiguration('tts').message);
    }
    let socket: WebSocket | undefined;
    try {
      socket = await withTimeout((signal) =>
        connectWebSocket(
          environment.VOLCENGINE_TTS_ENDPOINT!,
          {
            'X-Api-App-Key': environment.VOLCENGINE_SPEECH_APP_ID!,
            'X-Api-Access-Key': environment.VOLCENGINE_SPEECH_ACCESS_TOKEN!,
            'X-Api-Resource-Id': environment.VOLCENGINE_TTS_RESOURCE_ID!,
            'X-Api-Connect-Id': randomUUID(),
          },
          signal,
        ),
      );
      socket.send(createEventMessage(VolcengineEvent.StartConnection, undefined, {}));
      const response = parseVolcengineMessage(
        await withTimeout((signal) => readBinaryMessage(socket!, signal)),
      );
      if (
        response.type !== VolcengineMessageType.FullServerResponse ||
        response.event !== VolcengineEvent.ConnectionStarted
      ) {
        throw new ServiceCheckError('服务未接受语音合成连接，请检查资源标识和凭据。');
      }
      socket.send(createEventMessage(VolcengineEvent.FinishConnection, undefined, {}));
    } finally {
      closeWebSocket(socket);
    }
  }

  async #checkSearch(environment: NodeJS.ProcessEnv): Promise<void> {
    if (
      !hasValues(environment, ['VOLCENGINE_SEARCH_CUSTOM_ENDPOINT', 'VOLCENGINE_SEARCH_API_KEY'])
    ) {
      throw new ServiceCheckError(missingConfiguration('search').message);
    }
    const response = await withTimeout((signal) =>
      fetch(environment.VOLCENGINE_SEARCH_CUSTOM_ENDPOINT!, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${environment.VOLCENGINE_SEARCH_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Query: 'Microsoft Flight Simulator',
          SearchType: 'web',
          Count: 1,
          Filter: { NeedContent: false, NeedUrl: true },
          ContentFormats: 'markdown',
        }),
        signal,
      }),
    );
    if (!response.ok)
      throw new ServiceCheckError('服务拒绝了检测请求，请检查 API Key 与账号权限。');
  }
}
