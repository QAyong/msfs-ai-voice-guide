import { TokenVerifier } from 'livekit-server-sdk';
import { describe, expect, it } from 'vitest';
import { createDesktopSessionCredentials } from '../../desktop/main/session-token.js';
import { loadConfig } from '../../src/config/schema.js';

const config = loadConfig({
  LIVEKIT_URL: 'wss://livekit.example.test',
  LIVEKIT_API_KEY: 'livekit-key',
  LIVEKIT_API_SECRET: 'livekit-secret-at-least-32-characters',
  LIVEKIT_AGENT_NAME: 'msfs-voice-guide',
  DEEPSEEK_API_KEY: 'deepseek-secret',
  DEEPSEEK_BASE_URL: 'https://deepseek.example.test',
  DEEPSEEK_LLM_MODEL: 'deepseek-test-model',
  VOLCENGINE_SPEECH_APP_ID: 'speech-app',
  VOLCENGINE_SPEECH_ACCESS_TOKEN: 'speech-secret',
  VOLCENGINE_STT_ENDPOINT: 'wss://speech.example.test/asr',
  VOLCENGINE_STT_RESOURCE_ID: 'asr-resource',
  VOLCENGINE_TTS_ENDPOINT: 'wss://speech.example.test/tts',
  VOLCENGINE_TTS_RESOURCE_ID: 'tts-resource',
  VOLCENGINE_TTS_SPEAKER: 'speaker-id',
});

describe('desktop LiveKit session token', () => {
  it('creates a short-lived, room-scoped token with explicit agent dispatch', async () => {
    const session = await createDesktopSessionCredentials(config);
    const grants = await new TokenVerifier(config.livekit.apiKey, config.livekit.apiSecret).verify(
      session.token,
    );
    const payload = JSON.parse(
      Buffer.from(session.token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as { exp: number; nbf: number };

    expect(session.serverUrl).toBe(config.livekit.url);
    expect(grants.video).toMatchObject({
      roomJoin: true,
      room: session.roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
    });
    expect(grants.roomConfig?.agents[0]?.agentName).toBe(config.livekit.agentName);
    expect(payload.exp - payload.nbf).toBeLessThanOrEqual(15 * 60 + 1);
  });

  it('uses a unique room and identity for every desktop session', async () => {
    const first = await createDesktopSessionCredentials(config);
    const second = await createDesktopSessionCredentials(config);

    expect(first.roomName).not.toBe(second.roomName);
    expect(first.participantIdentity).not.toBe(second.participantIdentity);
  });
});
