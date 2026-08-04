import type { AgentState } from '@livekit/components-react';
import type { ConnectionState } from 'livekit-client';
import type { GuideToolActivity, GuideUserState } from '../../../shared/voice-control.js';

export type GuideAvatarExpression =
  'idle' | 'thinking' | 'tool-calling' | 'speaking-direct' | 'speaking-with-tools' | 'error';

type AvatarStateInput = {
  agentState: AgentState;
  connectionState: ConnectionState;
  hasError: boolean;
  toolActivity?: GuideToolActivity;
  usedToolsInTurn: boolean;
  userState?: GuideUserState;
};

export function resolveGuideAvatarExpression({
  agentState,
  connectionState,
  hasError,
  toolActivity,
  usedToolsInTurn,
  userState,
}: AvatarStateInput): GuideAvatarExpression {
  if (hasError || connectionState === 'disconnected') return 'error';
  if (userState === 'speaking') return 'idle';
  if (toolActivity === 'calling') return 'tool-calling';
  if (agentState === 'thinking') return 'thinking';
  if (agentState === 'speaking') {
    return usedToolsInTurn ? 'speaking-with-tools' : 'speaking-direct';
  }
  return 'idle';
}
