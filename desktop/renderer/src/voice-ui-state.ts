import type { AgentState } from '@livekit/components-react';
import type { ConnectionState } from 'livekit-client';
import type { GuideToolActivity, GuideUserState } from '../../../shared/voice-control.js';

type VoiceStatusInput = {
  agentState: AgentState;
  connectionState: ConnectionState;
  continuousActive: boolean;
  hasError: boolean;
  starting: boolean;
  toolActivity?: GuideToolActivity;
  userState?: GuideUserState;
};

export function resolveVoiceStatus({
  agentState,
  connectionState,
  continuousActive,
  hasError,
  starting,
  toolActivity,
  userState,
}: VoiceStatusInput): string {
  if (hasError) return '控制异常';
  if (starting || connectionState === 'connecting') return '连接中';
  if (connectionState === 'reconnecting' || connectionState === 'signalReconnecting') {
    return '重新连接';
  }
  if (connectionState === 'disconnected') return '连接异常';
  if (userState === 'speaking' && agentState === 'speaking') return '正在打断';
  if (userState === 'speaking') return '聆听中';
  if (toolActivity === 'calling') return '正在调用工具';
  if (agentState === 'thinking') return '思考中';
  if (agentState === 'speaking') return '回答中';
  if (agentState === 'connecting' || agentState === 'initializing' || agentState === 'idle') {
    return '等待导游';
  }
  if (continuousActive) return '等待你说话';
  return '在线';
}
