import type { AgentState } from '@livekit/components-react';
import type { ConnectionState } from 'livekit-client';
import type { GuideToolActivity, GuideUserState } from '../../../shared/voice-control.js';

type VoiceStatusInput = {
  agentState: AgentState;
  connectionState: ConnectionState;
  continuousActive: boolean;
  hasError: boolean;
  locale?: 'en-US' | 'zh-CN';
  starting: boolean;
  toolActivity?: GuideToolActivity;
  userState?: GuideUserState;
};

export function resolveVoiceStatus({
  agentState,
  connectionState,
  continuousActive,
  hasError,
  locale,
  starting,
  toolActivity,
  userState,
}: VoiceStatusInput): string {
  const english = locale === 'en-US';
  if (hasError) return english ? 'Control unavailable' : '控制异常';
  if (starting || connectionState === 'connecting') return english ? 'Connecting' : '连接中';
  if (connectionState === 'reconnecting' || connectionState === 'signalReconnecting') {
    return english ? 'Reconnecting' : '重新连接';
  }
  if (connectionState === 'disconnected') return english ? 'Connection issue' : '连接异常';
  if (userState === 'speaking' && agentState === 'speaking')
    return english ? 'Interrupting' : '正在打断';
  if (userState === 'speaking') return english ? 'Listening' : '聆听中';
  if (toolActivity === 'calling') return english ? 'Using tools' : '正在调用工具';
  if (agentState === 'thinking') return english ? 'Thinking' : '思考中';
  if (agentState === 'speaking') return english ? 'Responding' : '回答中';
  if (agentState === 'connecting' || agentState === 'initializing' || agentState === 'idle') {
    return english ? 'Waiting for Xiaoxiao' : '等待晓晓';
  }
  if (continuousActive) return english ? 'Waiting for you' : '等待你说话';
  return english ? 'Online' : '在线';
}
