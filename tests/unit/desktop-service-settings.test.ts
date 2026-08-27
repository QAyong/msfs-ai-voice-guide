import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseVolcengineMessage } from '../../src/providers/volcengine/protocol.js';

const websocketMock = vi.hoisted(() => ({
  closeWebSocket: vi.fn(),
  connectWebSocket: vi.fn(),
  readBinaryMessage: vi.fn(),
}));
const ttsSessionMock = vi.hoisted(() => ({
  runVolcengineTtsSession: vi.fn(),
}));

vi.mock('../../src/providers/volcengine/websocket.js', () => websocketMock);
vi.mock('../../src/providers/volcengine/tts-session.js', () => ttsSessionMock);

import {
  alignTtsSpeakerToLocale,
  defaultDesktopServiceSettings,
  defaultTtsSpeakerByLocale,
  desktopSettingsSaveRequestSchema,
  desktopServiceSettingsSchema,
  serviceSettingsSaveRequestSchema,
} from '../../shared/desktop-settings.js';
import {
  applyDesktopServiceSettings,
  mergeCredentialUpdates,
} from '../../desktop/main/service-settings.js';
import { ServiceAvailabilityChecker } from '../../desktop/main/service-checks.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

class FakeWebSocket extends EventEmitter {
  readonly readyState = 1;
  readonly sent: Buffer[] = [];

  send(data: Buffer): void {
    this.sent.push(data);
    if (data[1] !== 0x23) return;

    const payload = Buffer.from(
      JSON.stringify({ result: [{ utterances: [{ text: '检测成功', definite: true }] }] }),
      'utf8',
    );
    const response = Buffer.alloc(12 + payload.length);
    response[0] = 0x11;
    response[1] = 0xb3;
    response[2] = 0x00;
    response[3] = 0x00;
    response.writeInt32BE(-2, 4);
    response.writeUInt32BE(payload.length, 8);
    payload.copy(response, 12);
    queueMicrotask(() => this.emit('message', response));
  }
}

describe('desktop service settings', () => {
  it('accepts the fixed Provider configuration and keeps credentials out of its public DTO', () => {
    expect(desktopServiceSettingsSchema.parse(defaultDesktopServiceSettings)).toEqual(
      defaultDesktopServiceSettings,
    );
    expect(
      desktopServiceSettingsSchema.safeParse({
        ...defaultDesktopServiceSettings,
        apiKey: 'must-not-be-public',
      }).success,
    ).toBe(false);
  });

  it('validates the selected search provider before any Worker starts', () => {
    const invalid = structuredClone(defaultDesktopServiceSettings);
    invalid.search = { provider: 'other' as 'volcengine' };

    expect(
      serviceSettingsSaveRequestSchema.safeParse({ services: invalid, credentials: {} }).success,
    ).toBe(false);
  });

  it('aligns confirmed voices to the project language while preserving custom speakers', () => {
    expect(defaultTtsSpeakerByLocale['en-US']).toBe('en_female_dacey_uranus_bigtts');
    expect(alignTtsSpeakerToLocale('zh_female_vv_uranus_bigtts', 'en-US')).toBe(
      defaultTtsSpeakerByLocale['en-US'],
    );
    expect(alignTtsSpeakerToLocale('en_male_tim_uranus_bigtts', 'en-US')).toBe(
      defaultTtsSpeakerByLocale['en-US'],
    );
    expect(alignTtsSpeakerToLocale('en_male_tim_uranus_bigtts', 'zh-CN')).toBe(
      defaultTtsSpeakerByLocale['zh-CN'],
    );
    expect(alignTtsSpeakerToLocale('en_female_dacey_uranus_bigtts', 'en-US')).toBe(
      'en_female_dacey_uranus_bigtts',
    );
    expect(alignTtsSpeakerToLocale('en_female_stokie_uranus_bigtts', 'en-US')).toBe(
      'en_female_stokie_uranus_bigtts',
    );
    expect(alignTtsSpeakerToLocale('custom_speaker_id', 'en-US')).toBe('custom_speaker_id');
  });

  it('validates the unified locale and service settings request', () => {
    expect(
      desktopSettingsSaveRequestSchema.safeParse({
        locale: 'en-US',
        services: defaultDesktopServiceSettings,
        credentials: {},
      }).success,
    ).toBe(true);
  });

  it('uses inherited process settings before protected desktop settings, then local environment values', () => {
    const result = applyDesktopServiceSettings(
      {
        DEEPSEEK_API_KEY: 'from-local-env',
        DEEPSEEK_BASE_URL: 'https://from-local-env.example.test',
      },
      { DEEPSEEK_API_KEY: 'from-process-env' },
      {
        ...defaultDesktopServiceSettings,
        llm: { baseUrl: 'https://from-desktop-settings.example.test', model: 'desktop-model' },
      },
      { deepseekApiKey: 'from-protected-storage' },
    );

    expect(result.DEEPSEEK_API_KEY).toBe('from-process-env');
    expect(result.DEEPSEEK_BASE_URL).toBe('https://from-desktop-settings.example.test');
    expect(result.DEEPSEEK_LLM_MODEL).toBe('desktop-model');
  });

  it('applies the selected search provider and its protected credential', () => {
    const result = applyDesktopServiceSettings(
      {},
      {},
      { ...defaultDesktopServiceSettings, search: { provider: 'bocha' } },
      { bochaSearchApiKey: 'bocha-key' },
    );

    expect(result.SEARCH_PROVIDER).toBe('bocha');
    expect(result.BOCHA_SEARCH_API_KEY).toBe('bocha-key');
  });

  it('merges only explicit credential changes so blank fields preserve existing secrets', () => {
    expect(
      mergeCredentialUpdates(
        { deepseekApiKey: 'old-key', searchApiKey: 'old-search-key' },
        { searchApiKey: null },
      ),
    ).toEqual({ deepseekApiKey: 'old-key' });
  });

  it('returns a redacted service-check failure and rate-limits repeated checks', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private-api-key-should-not-leak')));
    const checker = new ServiceAvailabilityChecker();
    const environment = {
      DEEPSEEK_API_KEY: 'private-api-key-should-not-leak',
      DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
      DEEPSEEK_LLM_MODEL: 'deepseek-v4-flash',
    };

    const first = await checker.check('llm', environment);
    const second = await checker.check('llm', environment);

    expect(first.status).toBe('unavailable');
    expect(first.message).not.toContain('private-api-key-should-not-leak');
    expect(second.status).toBe('rate_limited');
  });

  it('uses a real chat completion request for LLM checks', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ choices: [{ message: { content: '检测成功。' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const checker = new ServiceAvailabilityChecker();

    const result = await checker.check('llm', {
      DEEPSEEK_API_KEY: 'deepseek-key',
      DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
      DEEPSEEK_LLM_MODEL: 'deepseek-v4-flash',
    });

    expect(result.status).toBe('available');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer deepseek-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
          messages: [{ role: 'user', content: '请只回复：检测成功。' }],
          stream: false,
          max_tokens: 16,
          thinking: { type: 'disabled' },
        }),
      }),
    );
  });

  it('sends audio and waits for a transcript for STT checks', async () => {
    const socket = new FakeWebSocket();
    websocketMock.connectWebSocket.mockResolvedValue(socket);
    const checker = new ServiceAvailabilityChecker({
      getSttProbeAudioPath: () =>
        join(
          process.cwd(),
          'resources',
          'tts',
          'confirmed-voices',
          'Vivi-2.0_zh_female_vv_uranus_bigtts.wav',
        ),
    });

    const result = await checker.check('stt', {
      VOLCENGINE_SPEECH_APP_ID: 'app-id',
      VOLCENGINE_SPEECH_ACCESS_TOKEN: 'access-token',
      VOLCENGINE_STT_ENDPOINT: 'wss://speech.example.test/asr',
      VOLCENGINE_STT_RESOURCE_ID: 'asr-resource',
      VOLCENGINE_STT_MODEL: 'bigmodel',
    });

    expect(result.status).toBe('available');
    expect(socket.sent.length).toBeGreaterThan(1);
    const request = parseVolcengineMessage(socket.sent[0]!);
    expect(JSON.parse(request.payload.toString('utf8'))).toMatchObject({
      audio: { rate: 16_000, bits: 16, channel: 1 },
      request: { model_name: 'bigmodel' },
    });
    expect(socket.sent.at(-1)?.[1]).toBe(0x23);
  });

  it('runs a full synthesis session for TTS checks', async () => {
    ttsSessionMock.runVolcengineTtsSession.mockResolvedValue({ audioBytes: 128 });
    const checker = new ServiceAvailabilityChecker();

    const result = await checker.check('tts', {
      VOLCENGINE_SPEECH_APP_ID: 'app-id',
      VOLCENGINE_SPEECH_ACCESS_TOKEN: 'access-token',
      VOLCENGINE_TTS_ENDPOINT: 'wss://speech.example.test/tts',
      VOLCENGINE_TTS_RESOURCE_ID: 'tts-resource',
      VOLCENGINE_TTS_SPEAKER: 'zh_female_vv_uranus_bigtts',
      VOLCENGINE_TTS_SAMPLE_RATE: '24000',
    });

    expect(result.status).toBe('available');
    expect(ttsSessionMock.runVolcengineTtsSession).toHaveBeenCalledWith(
      {
        appId: 'app-id',
        accessToken: 'access-token',
        endpoint: 'wss://speech.example.test/tts',
        resourceId: 'tts-resource',
        speaker: 'zh_female_vv_uranus_bigtts',
        sampleRate: 24_000,
      },
      '服务检测成功。',
      { signal: expect.any(AbortSignal) },
    );
  });

  it('localizes service-check failures for the English locale', async () => {
    const checker = new ServiceAvailabilityChecker();
    const result = await checker.check('llm', {}, 'en-US');

    expect(result).toMatchObject({
      status: 'unavailable',
      message: 'Enter the address and credentials required by this service first.',
    });
  });

  it('checks the selected Bocha search provider with the provider payload', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ webPages: { value: [] } }));
    vi.stubGlobal('fetch', fetchMock);
    const checker = new ServiceAvailabilityChecker();

    const result = await checker.check('search', {
      SEARCH_PROVIDER: 'bocha',
      BOCHA_SEARCH_API_KEY: 'bocha-key',
      BOCHA_SEARCH_ENDPOINT: 'https://api.bochaai.com/v1/web-search',
      BOCHA_SEARCH_TIMEOUT_MS: '10000',
    });

    expect(result.status).toBe('available');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.bochaai.com/v1/web-search',
      expect.objectContaining({
        body: JSON.stringify({
          query: 'Microsoft Flight Simulator',
          freshness: 'noLimit',
          summary: true,
          count: 10,
        }),
      }),
    );
  });
});
