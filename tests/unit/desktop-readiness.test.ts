import { describe, expect, it } from 'vitest';
import {
  checkDesktopConfiguration,
  localLiveKitFailureReadiness,
  workerFailureReadiness,
} from '../../desktop/main/readiness.js';

describe('desktop readiness diagnostics', () => {
  it('returns setup guidance without echoing environment values', () => {
    const result = checkDesktopConfiguration({
      LIVEKIT_URL: 'https://invalid.example.test',
      LIVEKIT_API_SECRET: 'must-never-appear',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.readiness.status).toBe('setup_required');
    expect(result.readiness.message).toBe('未配置服务，请配置服务。');
    expect(result.readiness.issues.join(' ')).toContain('LIVEKIT_URL');
    expect(JSON.stringify(result.readiness)).not.toContain('must-never-appear');
  });

  it('redacts credential-like values from Worker failures', () => {
    const readiness = workerFailureReadiness(
      new Error('api_key=visible-key secret:visible-secret token=visible-token'),
    );

    expect(readiness.status).toBe('error');
    expect(JSON.stringify(readiness)).not.toContain('visible-key');
    expect(JSON.stringify(readiness)).not.toContain('visible-secret');
    expect(JSON.stringify(readiness)).not.toContain('visible-token');
  });

  it('reports a local Server startup failure without leaking its credentials', () => {
    const readiness = localLiveKitFailureReadiness(
      new Error('secret=local-livekit-secret address already in use'),
    );

    expect(readiness).toMatchObject({ status: 'error', message: '本地 LiveKit 服务未能启动。' });
    expect(JSON.stringify(readiness)).not.toContain('local-livekit-secret');
  });

  it('localizes readiness messages for the English locale', () => {
    const configuration = checkDesktopConfiguration(
      { LIVEKIT_URL: 'https://invalid.example.test', LIVEKIT_API_SECRET: 'secret' },
      'en-US',
    );
    expect(configuration.ok).toBe(false);
    if (configuration.ok) return;
    expect(configuration.readiness.message).toBe(
      'Required services are not configured. Open settings to configure them.',
    );
    expect(configuration.readiness.issues.join(' ')).not.toMatch(/\p{Script=Han}/u);

    expect(
      workerFailureReadiness(new Error('等待 LiveKit Worker 就绪超时'), 'en-US'),
    ).toMatchObject({
      message: 'The AI service did not connect to LiveKit.',
      issues: ['Timed out waiting for the LiveKit worker to become ready'],
    });
    expect(
      localLiveKitFailureReadiness(new Error('本地 LiveKit Server 未能启动。'), 'en-US'),
    ).toMatchObject({
      message: 'The local LiveKit service could not start.',
      issues: ['The local LiveKit server could not start.'],
    });
  });
});
