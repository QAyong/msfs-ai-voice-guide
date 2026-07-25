import { describe, expect, it } from 'vitest';
import { ConnectionState } from 'livekit-client';
import { resolveVoiceStatus } from '../../desktop/renderer/src/voice-ui-state.js';

const connected = {
  connectionState: ConnectionState.Connected,
  continuousActive: true,
  hasError: false,
  starting: false,
};

describe('official voice UI status', () => {
  it('does not label an idle continuous microphone as active speech', () => {
    expect(
      resolveVoiceStatus({ ...connected, agentState: 'listening', userState: 'listening' }),
    ).toBe('等待你说话');
  });

  it('shows real user and agent activity in priority order', () => {
    expect(
      resolveVoiceStatus({ ...connected, agentState: 'listening', userState: 'speaking' }),
    ).toBe('聆听中');
    expect(
      resolveVoiceStatus({ ...connected, agentState: 'thinking', userState: 'listening' }),
    ).toBe('思考中');
    expect(
      resolveVoiceStatus({
        ...connected,
        agentState: 'thinking',
        toolActivity: 'calling',
        userState: 'listening',
      }),
    ).toBe('正在调用工具');
    expect(
      resolveVoiceStatus({ ...connected, agentState: 'speaking', userState: 'listening' }),
    ).toBe('回答中');
    expect(
      resolveVoiceStatus({ ...connected, agentState: 'speaking', userState: 'speaking' }),
    ).toBe('正在打断');
  });
});
