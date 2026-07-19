import { describe, expect, it } from 'vitest';
import { checkDesktopConfiguration, workerFailureReadiness } from '../../desktop/main/readiness.js';

describe('desktop readiness diagnostics', () => {
  it('returns setup guidance without echoing environment values', () => {
    const result = checkDesktopConfiguration({
      LIVEKIT_URL: 'https://invalid.example.test',
      LIVEKIT_API_SECRET: 'must-never-appear',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.readiness.status).toBe('setup_required');
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
});
