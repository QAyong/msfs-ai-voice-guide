export const guideVoiceRpc = {
  startTurn: 'msfs.guide.start_turn',
  endTurn: 'msfs.guide.end_turn',
  cancelTurn: 'msfs.guide.cancel_turn',
  startContinuous: 'msfs.guide.start_continuous',
  stopContinuous: 'msfs.guide.stop_continuous',
  cancelNarration: 'msfs.guide.cancel_narration',
  suspendVoice: 'msfs.guide.suspend_voice',
  resumeVoice: 'msfs.guide.resume_voice',
} as const;

export type GuideVoiceRpcMethod = (typeof guideVoiceRpc)[keyof typeof guideVoiceRpc];

export type VoiceInputMode = 'push_to_talk' | 'continuous';

export type GuideUserState = 'speaking' | 'listening' | 'away';

export type GuideToolActivity = 'idle' | 'calling';

export const guideVoiceAttributes = {
  inputMode: 'msfs.guide.voice_input_mode',
  userState: 'msfs.guide.user_state',
  toolActivity: 'msfs.guide.tool_activity',
} as const;

export const guideTurnDetection = {
  continuous: null,
  pushToTalk: 'manual',
} as const;

export function isVoiceInputMode(value: unknown): value is VoiceInputMode {
  return value === 'push_to_talk' || value === 'continuous';
}

export function isGuideUserState(value: unknown): value is GuideUserState {
  return value === 'speaking' || value === 'listening' || value === 'away';
}

export function isGuideToolActivity(value: unknown): value is GuideToolActivity {
  return value === 'idle' || value === 'calling';
}
