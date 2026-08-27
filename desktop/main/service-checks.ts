import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type WebSocket from 'ws';
import type { RawData } from 'ws';
import { type ServiceCheckResult, type ServiceCheckTarget } from '../../shared/desktop-settings.js';
import {
  createAsrAudioRequest,
  createAsrFullRequest,
  parseVolcengineMessage,
  VolcengineMessageFlag,
  VolcengineMessageType,
} from '../../src/providers/volcengine/protocol.js';
import { runVolcengineTtsSession } from '../../src/providers/volcengine/tts-session.js';
import {
  closeWebSocket,
  connectWebSocket,
} from '../../src/providers/volcengine/websocket.js';
import {
  defaultSearchEndpointByProvider,
  defaultSearchTimeoutMs,
} from '../../src/search/defaults.js';
import { SearchProviderError } from '../../src/search/provider.js';
import { createSearchProvider } from '../../src/search/registry.js';
import { searchProviderSchema, type SearchProviderName } from '../../shared/search-provider.js';
import { localizeDesktopText, type DesktopLocale } from '../../shared/desktop-locale.js';

const checkTimeoutMs = 10_000;
const minimumCheckIntervalMs = 2_500;
const sttProbeSampleRate = 16_000;
const sttProbeDurationMs = 2_000;
const sttProbeChunkDurationMs = 200;
const sttProbeChunkBytes =
  (sttProbeSampleRate * 2 * sttProbeChunkDurationMs) / 1_000;
const sttProbeAudioFileByLocale: Record<DesktopLocale, string> = {
  'en-US': 'Dacey_en_female_dacey_uranus_bigtts.wav',
  'zh-CN': 'Vivi-2.0_zh_female_vv_uranus_bigtts.wav',
};

class ServiceCheckError extends Error {
  constructor(message: string) {
    super(message);
  }
}

const missingConfiguration = (
  target: ServiceCheckTarget,
  locale: DesktopLocale,
): ServiceCheckResult => ({
  target,
  status: 'unavailable',
  message: localizeDesktopText(
    locale,
    'Enter the address and credentials required by this service first.',
    '请先填写此服务所需的地址和凭据。',
  ),
});

const unavailable = (target: ServiceCheckTarget, message: string): ServiceCheckResult => ({
  target,
  status: 'unavailable',
  message,
});

function hasValues(environment: NodeJS.ProcessEnv, keys: readonly string[]): boolean {
  return keys.every((key) => Boolean(environment[key]?.trim()));
}

function chatCompletionsUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL('chat/completions', normalizedBaseUrl).toString();
}

function defaultSttProbeAudioPath(locale: DesktopLocale): string {
  return join(
    process.cwd(),
    'resources',
    'tts',
    'confirmed-voices',
    sttProbeAudioFileByLocale[locale],
  );
}

type PcmWav = {
  data: Buffer;
  sampleRate: number;
};

function parsePcmWav(input: Buffer): PcmWav {
  if (
    input.length < 12 ||
    input.toString('ascii', 0, 4) !== 'RIFF' ||
    input.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('语音样本不是有效的 WAV 文件');
  }

  let audioFormat: number | undefined;
  let channels: number | undefined;
  let sampleRate: number | undefined;
  let bitsPerSample: number | undefined;
  let data: Buffer | undefined;
  let offset = 12;

  while (offset + 8 <= input.length) {
    const chunkSize = input.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;
    if (chunkEnd > input.length) throw new Error('WAV 数据块不完整');

    switch (input.toString('ascii', offset, offset + 4)) {
      case 'fmt ':
        if (chunkSize < 16) throw new Error('WAV 格式块不完整');
        audioFormat = input.readUInt16LE(chunkStart);
        channels = input.readUInt16LE(chunkStart + 2);
        sampleRate = input.readUInt32LE(chunkStart + 4);
        bitsPerSample = input.readUInt16LE(chunkStart + 14);
        break;
      case 'data':
        data = input.subarray(chunkStart, chunkEnd);
        break;
      default:
        break;
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  if (
    audioFormat !== 1 ||
    channels !== 1 ||
    bitsPerSample !== 16 ||
    !sampleRate ||
    !data ||
    data.length === 0
  ) {
    throw new Error('WAV 样本必须是单声道 16-bit PCM 音频');
  }
  return { data, sampleRate };
}

function prepareSttProbeAudio(wav: PcmWav): Buffer {
  const sourceSampleCount = Math.min(
    Math.floor(wav.data.length / 2),
    Math.floor((wav.sampleRate * sttProbeDurationMs) / 1_000),
  );
  if (sourceSampleCount <= 0) throw new Error('WAV 样本没有可用音频');

  const source = wav.data.subarray(0, sourceSampleCount * 2);
  if (wav.sampleRate === sttProbeSampleRate) return source;

  const targetSampleCount = Math.max(
    1,
    Math.ceil((sourceSampleCount * sttProbeSampleRate) / wav.sampleRate),
  );
  const output = Buffer.alloc(targetSampleCount * 2);
  for (let index = 0; index < targetSampleCount; index += 1) {
    const sourcePosition = (index * wav.sampleRate) / sttProbeSampleRate;
    const leftIndex = Math.min(Math.floor(sourcePosition), sourceSampleCount - 1);
    const rightIndex = Math.min(leftIndex + 1, sourceSampleCount - 1);
    const ratio = sourcePosition - leftIndex;
    const left = source.readInt16LE(leftIndex * 2);
    const right = source.readInt16LE(rightIndex * 2);
    const value = Math.round(left + (right - left) * ratio);
    output.writeInt16LE(Math.max(-32_768, Math.min(32_767, value)), index * 2);
  }
  return output;
}

async function loadSttProbeAudio(
  filePath: string,
  locale: DesktopLocale,
): Promise<Buffer> {
  try {
    return prepareSttProbeAudio(parsePcmWav(await readFile(filePath)));
  } catch {
    throw new ServiceCheckError(
      localizeDesktopText(
        locale,
        'The built-in speech test sample is unavailable. Restore the application resources and try again.',
        '内置语音检测样本不可用，请恢复应用资源后重试。',
      ),
    );
  }
}

function rawDataToBuffer(data: RawData): Buffer {
  return Array.isArray(data)
    ? Buffer.concat(data)
    : Buffer.isBuffer(data)
      ? data
      : Buffer.from(data);
}

function parseSttProbeText(payload: Buffer): string {
  let body: unknown;
  try {
    body = JSON.parse(payload.toString('utf8'));
  } catch {
    return '';
  }
  if (!body || typeof body !== 'object') return '';

  const root = body as Record<string, unknown>;
  const result = root.result;
  const firstResult = Array.isArray(result) ? result[0] : result;
  if (firstResult && typeof firstResult === 'object') {
    const value = firstResult as Record<string, unknown>;
    if (Array.isArray(value.utterances)) {
      const utteranceText = value.utterances
        .flatMap((utterance) => {
          if (!utterance || typeof utterance !== 'object') return [];
          const text = (utterance as Record<string, unknown>).text;
          return typeof text === 'string' && text.trim() ? [text.trim()] : [];
        })
        .join(' ');
      if (utteranceText) return utteranceText;
    }
    if (typeof value.text === 'string' && value.text.trim()) return value.text.trim();
  }
  return typeof root.text === 'string' ? root.text.trim() : '';
}

function readSttProbeTranscript(socket: WebSocket, signal: AbortSignal): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let latestText = '';
    let settled = false;
    const cleanup = () => {
      socket.off('message', onMessage);
      socket.off('error', onError);
      socket.off('close', onClose);
      signal.removeEventListener('abort', onAbort);
    };
    const resolveOnce = (value: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onMessage = (data: RawData) => {
      try {
        const message = parseVolcengineMessage(rawDataToBuffer(data));
        if (message.type === VolcengineMessageType.ServerError) {
          rejectOnce(new Error(`火山 ASR 错误：${message.errorCode ?? 'unknown'}`));
          return;
        }
        if (message.payload.length > 0) {
          const text = parseSttProbeText(message.payload);
          if (text) latestText = text;
        }
        if (
          message.flag === VolcengineMessageFlag.NegativeSequence ||
          (message.sequence !== undefined && message.sequence < 0)
        ) {
          resolveOnce(latestText);
        }
      } catch (error) {
        rejectOnce(error instanceof Error ? error : new Error(String(error)));
      }
    };
    const onError = (error: Error) => rejectOnce(error);
    const onClose = () => rejectOnce(new Error('WebSocket 在收到识别结果前关闭'));
    const onAbort = () => {
      rejectOnce(new Error('WebSocket 请求已取消'));
      closeWebSocket(socket);
    };

    socket.on('message', onMessage);
    socket.once('error', onError);
    socket.once('close', onClose);
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
}

function sendSttProbeRequest(
  socket: WebSocket,
  audio: Buffer,
  requestId: string,
  model: string,
  language: string,
): void {
  socket.send(
    createAsrFullRequest({
      user: { uid: requestId },
      audio: {
        format: 'pcm',
        codec: 'raw',
        rate: sttProbeSampleRate,
        bits: 16,
        channel: 1,
        language,
      },
      request: {
        reqid: requestId,
        model_name: model,
        show_utterances: true,
        result_type: 'single',
        enable_itn: true,
      },
    }),
  );

  let sequence = 1;
  for (let offset = 0; offset < audio.length; offset += sttProbeChunkBytes) {
    const chunk = audio.subarray(offset, offset + sttProbeChunkBytes);
    const isFinal = offset + chunk.length >= audio.length;
    sequence += 1;
    socket.send(createAsrAudioRequest(chunk, sequence, isFinal));
  }
}

function hasChatCompletionText(body: unknown): boolean {
  if (!body || typeof body !== 'object' || !('choices' in body) || !Array.isArray(body.choices)) {
    return false;
  }
  const firstChoice = body.choices[0];
  if (!firstChoice || typeof firstChoice !== 'object' || !('message' in firstChoice)) {
    return false;
  }
  const message = firstChoice.message;
  return (
    !!message &&
    typeof message === 'object' &&
    'content' in message &&
    typeof message.content === 'string' &&
    message.content.trim().length > 0
  );
}

function toSafeFailure(
  target: ServiceCheckTarget,
  error: unknown,
  locale: DesktopLocale,
): ServiceCheckResult {
  if (error instanceof ServiceCheckError) return unavailable(target, error.message);
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return unavailable(
      target,
      localizeDesktopText(
        locale,
        'The check timed out. Verify the network and service address, then try again.',
        '检测超时，请确认网络、服务地址后重试。',
      ),
    );
  }
  if (error instanceof Error && /abort|cancel|timeout/i.test(error.message)) {
    return unavailable(
      target,
      localizeDesktopText(
        locale,
        'The check timed out. Verify the network and service address, then try again.',
        '检测超时，请确认网络、服务地址后重试。',
      ),
    );
  }
  return unavailable(
    target,
    localizeDesktopText(
      locale,
      'Unable to connect to or verify this service. Check the address and credentials.',
      '无法连接或验证此服务，请检查地址与凭据。',
    ),
  );
}

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  return work(AbortSignal.timeout(checkTimeoutMs));
}

export class ServiceAvailabilityChecker {
  readonly #lastCheckAt = new Map<ServiceCheckTarget, number>();
  readonly #getSttProbeAudioPath: (locale: DesktopLocale) => string;

  constructor(options: { getSttProbeAudioPath?: (locale: DesktopLocale) => string } = {}) {
    this.#getSttProbeAudioPath = options.getSttProbeAudioPath ?? defaultSttProbeAudioPath;
  }

  async check(
    target: ServiceCheckTarget,
    environment: NodeJS.ProcessEnv,
    locale: DesktopLocale = 'zh-CN',
  ): Promise<ServiceCheckResult> {
    const now = Date.now();
    const lastCheckAt = this.#lastCheckAt.get(target);
    if (lastCheckAt !== undefined && now - lastCheckAt < minimumCheckIntervalMs) {
      return {
        target,
        status: 'rate_limited',
        message: localizeDesktopText(
          locale,
          'Please wait before retrying to avoid duplicate service checks.',
          '请稍候再试，避免向服务发送重复检测请求。',
        ),
      };
    }
    this.#lastCheckAt.set(target, now);

    try {
      switch (target) {
        case 'llm':
          await this.#checkLlm(environment, locale);
          break;
        case 'stt':
          await this.#checkStt(environment, locale);
          break;
        case 'tts':
          await this.#checkTts(environment, locale);
          break;
        case 'search':
          await this.#checkSearch(environment, locale);
          break;
      }
      return {
        target,
        status: 'available',
        message: localizeDesktopText(
          locale,
          'Service available. The address and credentials were verified.',
          '服务可用，地址与凭据验证通过。',
        ),
        latencyMs: Date.now() - now,
      };
    } catch (error) {
      return toSafeFailure(target, error, locale);
    }
  }

  async #checkLlm(environment: NodeJS.ProcessEnv, locale: DesktopLocale): Promise<void> {
    if (!hasValues(environment, ['DEEPSEEK_BASE_URL', 'DEEPSEEK_LLM_MODEL', 'DEEPSEEK_API_KEY'])) {
      throw new ServiceCheckError(missingConfiguration('llm', locale).message);
    }
    const response = await withTimeout((signal) =>
      fetch(chatCompletionsUrl(environment.DEEPSEEK_BASE_URL!), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${environment.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: environment.DEEPSEEK_LLM_MODEL,
          messages: [
            {
              role: 'user',
              content: localizeDesktopText(
                locale,
                'Reply with only: check passed.',
                '请只回复：检测成功。',
              ),
            },
          ],
          stream: false,
          max_tokens: 16,
          ...(environment.DEEPSEEK_LLM_MODEL?.startsWith('deepseek-v4-')
            ? { thinking: { type: 'disabled' } }
            : {}),
        }),
        signal,
      }),
    );
    if (!response.ok)
      throw new ServiceCheckError(
        localizeDesktopText(
          locale,
          'The service rejected the check. Verify the API key and account permissions.',
          '服务拒绝了检测请求，请检查 API Key 与账号权限。',
        ),
      );
    const body: unknown = await response.json().catch(() => null);
    if (!hasChatCompletionText(body))
      throw new ServiceCheckError(
        localizeDesktopText(
          locale,
          'The service returned an unexpected response format. Check the service address.',
          '服务返回格式异常，请检查服务地址。',
        ),
      );
  }

  async #checkStt(environment: NodeJS.ProcessEnv, locale: DesktopLocale): Promise<void> {
    const apiKey = environment.VOLCENGINE_SPEECH_API_KEY?.trim();
    const hasLegacyCredentials = hasValues(environment, [
      'VOLCENGINE_SPEECH_APP_ID',
      'VOLCENGINE_SPEECH_ACCESS_TOKEN',
    ]);
    if (
      !hasValues(environment, ['VOLCENGINE_STT_ENDPOINT', 'VOLCENGINE_STT_RESOURCE_ID']) ||
      (!apiKey && !hasLegacyCredentials)
    ) {
      throw new ServiceCheckError(missingConfiguration('stt', locale).message);
    }

    const audio = await loadSttProbeAudio(this.#getSttProbeAudioPath(locale), locale);
    let socket: WebSocket | undefined;
    try {
      await withTimeout(async (signal) => {
        const requestId = randomUUID();
        const headers: Record<string, string> = {
          'X-Api-Resource-Id': environment.VOLCENGINE_STT_RESOURCE_ID!,
          'X-Api-Request-Id': requestId,
          'X-Api-Connect-Id': requestId,
          'X-Api-Sequence': '-1',
        };
        if (apiKey) {
          headers['X-Api-Key'] = apiKey;
        } else {
          headers['X-Api-App-Key'] = environment.VOLCENGINE_SPEECH_APP_ID!;
          headers['X-Api-Access-Key'] = environment.VOLCENGINE_SPEECH_ACCESS_TOKEN!;
        }

        socket = await connectWebSocket(environment.VOLCENGINE_STT_ENDPOINT!, headers, signal);
        const transcriptPromise = readSttProbeTranscript(socket, signal);
        sendSttProbeRequest(
          socket,
          audio,
          requestId,
          environment.VOLCENGINE_STT_MODEL?.trim() || 'bigmodel',
          environment.VOLCENGINE_STT_LANGUAGE?.trim() || (locale === 'en-US' ? 'en' : 'zh'),
        );
        const transcript = await transcriptPromise;
        if (!transcript) {
          throw new ServiceCheckError(
            localizeDesktopText(
              locale,
              'The speech recognition service returned no usable transcript.',
              '语音识别服务未返回有效识别结果。',
            ),
          );
        }
      });
    } finally {
      closeWebSocket(socket);
    }
  }

  async #checkTts(environment: NodeJS.ProcessEnv, locale: DesktopLocale): Promise<void> {
    if (
      !hasValues(environment, [
        'VOLCENGINE_TTS_ENDPOINT',
        'VOLCENGINE_TTS_RESOURCE_ID',
        'VOLCENGINE_TTS_SPEAKER',
        'VOLCENGINE_SPEECH_APP_ID',
        'VOLCENGINE_SPEECH_ACCESS_TOKEN',
      ])
    ) {
      throw new ServiceCheckError(missingConfiguration('tts', locale).message);
    }
    const sampleRate = Number(environment.VOLCENGINE_TTS_SAMPLE_RATE ?? 24_000);
    if (!Number.isInteger(sampleRate) || sampleRate < 8_000 || sampleRate > 48_000) {
      throw new ServiceCheckError(
        localizeDesktopText(
          locale,
          'The speech synthesis sample rate is invalid.',
          '语音合成采样率无效。',
        ),
      );
    }

    const result = await withTimeout((signal) =>
      runVolcengineTtsSession(
        {
          appId: environment.VOLCENGINE_SPEECH_APP_ID!,
          accessToken: environment.VOLCENGINE_SPEECH_ACCESS_TOKEN!,
          endpoint: environment.VOLCENGINE_TTS_ENDPOINT!,
          resourceId: environment.VOLCENGINE_TTS_RESOURCE_ID!,
          speaker: environment.VOLCENGINE_TTS_SPEAKER!,
          sampleRate,
        },
        locale === 'en-US' ? 'Service check passed.' : '服务检测成功。',
        { signal },
      ),
    );
    if (result.audioBytes <= 0) {
      throw new ServiceCheckError(
        localizeDesktopText(
          locale,
          'The speech synthesis service returned no audio.',
          '语音合成服务未返回音频。',
        ),
      );
    }
  }

  async #checkSearch(environment: NodeJS.ProcessEnv, locale: DesktopLocale): Promise<void> {
    const providerResult = searchProviderSchema.safeParse(environment.SEARCH_PROVIDER);
    const provider: SearchProviderName = providerResult.success
      ? providerResult.data
      : 'volcengine';
    const keyName = provider === 'bocha' ? 'BOCHA_SEARCH_API_KEY' : 'VOLCENGINE_SEARCH_API_KEY';
    const endpointName =
      provider === 'bocha' ? 'BOCHA_SEARCH_ENDPOINT' : 'VOLCENGINE_SEARCH_CUSTOM_ENDPOINT';
    const timeoutName =
      provider === 'bocha' ? 'BOCHA_SEARCH_TIMEOUT_MS' : 'VOLCENGINE_SEARCH_TIMEOUT_MS';
    const apiKey = environment[keyName]?.trim();
    if (!apiKey) {
      throw new ServiceCheckError(missingConfiguration('search', locale).message);
    }
    const endpoint = environment[endpointName]?.trim() || defaultSearchEndpointByProvider[provider];
    const parsedTimeout = Number(environment[timeoutName]);
    const timeoutMs =
      Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : defaultSearchTimeoutMs;
    const searchProvider = createSearchProvider({
      provider,
      apiKey,
      endpoint,
      timeoutMs,
    });
    try {
      await withTimeout((signal) =>
        searchProvider.search({ query: 'Microsoft Flight Simulator' }, signal),
      );
    } catch (error) {
      if (error instanceof SearchProviderError) {
        if (error.code === 'timeout') {
          throw new ServiceCheckError(
            localizeDesktopText(
              locale,
              'The check timed out. Verify the network and service address, then try again.',
              '检测超时，请确认网络、服务地址后重试。',
            ),
          );
        }
        if (error.code === 'invalid_response') {
          throw new ServiceCheckError(
            localizeDesktopText(
              locale,
              'The service returned an unexpected response format. Check the service address.',
              '服务返回格式异常，请检查服务地址。',
            ),
          );
        }
        if (error.code === 'network_error') {
          throw new ServiceCheckError(
            localizeDesktopText(
              locale,
              'Unable to connect to or verify this service. Check the address and credentials.',
              '无法连接或验证此服务，请检查地址与凭据。',
            ),
          );
        }
        throw new ServiceCheckError(
          localizeDesktopText(
            locale,
            'The service rejected the check. Verify the API key and account permissions.',
            '服务拒绝了检测请求，请检查 API Key 与账号权限。',
          ),
        );
      }
      throw error;
    }
  }
}
