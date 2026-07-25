import { describe, expect, it } from 'vitest';
import { ConnectionState } from 'livekit-client';
import { resolveGuideAvatarExpression } from '../../desktop/renderer/src/avatar-state.js';

const connected = {
  connectionState: ConnectionState.Connected,
  hasError: false,
  usedToolsInTurn: false,
};

describe('guide avatar expressions', () => {
  it('keeps the listening state on the idle expression', () => {
    expect(
      resolveGuideAvatarExpression({
        ...connected,
        agentState: 'listening',
        userState: 'speaking',
      }),
    ).toBe('idle');
  });

  it('shows the tool expression only while a tool is executing', () => {
    expect(
      resolveGuideAvatarExpression({
        ...connected,
        agentState: 'thinking',
        toolActivity: 'calling',
      }),
    ).toBe('tool-calling');
  });

  it('uses the response expression that matches the current turn history', () => {
    expect(resolveGuideAvatarExpression({ ...connected, agentState: 'speaking' })).toBe(
      'speaking-direct',
    );
    expect(
      resolveGuideAvatarExpression({
        ...connected,
        agentState: 'speaking',
        usedToolsInTurn: true,
      }),
    ).toBe('speaking-with-tools');
  });
});
