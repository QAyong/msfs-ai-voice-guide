import { describe, expect, it } from 'vitest';
import {
  guideVoiceAttributes,
  guideVoiceRpc,
  guideTurnDetection,
  isGuideToolActivity,
  isGuideUserState,
  isVoiceInputMode,
} from '../../shared/voice-control.js';

describe('voice input control contract', () => {
  it('defines stable RPC methods for manual and continuous turn control', () => {
    expect(guideVoiceRpc).toEqual({
      startTurn: 'msfs.guide.start_turn',
      endTurn: 'msfs.guide.end_turn',
      cancelTurn: 'msfs.guide.cancel_turn',
      startContinuous: 'msfs.guide.start_continuous',
      stopContinuous: 'msfs.guide.stop_continuous',
      suspendVoice: 'msfs.guide.suspend_voice',
      resumeVoice: 'msfs.guide.resume_voice',
    });
  });

  it('accepts only supported input modes', () => {
    expect(isVoiceInputMode('push_to_talk')).toBe(true);
    expect(isVoiceInputMode('continuous')).toBe(true);
    expect(isVoiceInputMode('always_on')).toBe(false);
    expect(isVoiceInputMode(undefined)).toBe(false);
  });

  it('exposes participant attributes for official session telemetry', () => {
    expect(guideVoiceAttributes).toEqual({
      inputMode: 'msfs.guide.voice_input_mode',
      userState: 'msfs.guide.user_state',
      toolActivity: 'msfs.guide.tool_activity',
    });
    expect(isGuideUserState('speaking')).toBe(true);
    expect(isGuideUserState('listening')).toBe(true);
    expect(isGuideUserState('away')).toBe(true);
    expect(isGuideUserState('thinking')).toBe(false);
    expect(isGuideToolActivity('calling')).toBe(true);
    expect(isGuideToolActivity('idle')).toBe(true);
    expect(isGuideToolActivity('thinking')).toBe(false);
  });

  it('restores LiveKit automatic turn detection for continuous mode', () => {
    expect(guideTurnDetection).toEqual({
      continuous: null,
      pushToTalk: 'manual',
    });
  });
});
