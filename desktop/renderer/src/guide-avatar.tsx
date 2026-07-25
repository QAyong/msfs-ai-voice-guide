import avatarError from './assets/guide-avatar/avatar-error.png';
import avatarFloat from './assets/guide-avatar/avatar-float.png';
import avatarIdle from './assets/guide-avatar/avatar-idle.png';
import avatarSpeakingDirect from './assets/guide-avatar/avatar-speaking-direct.png';
import avatarSpeakingWithTools from './assets/guide-avatar/avatar-speaking-with-tools.png';
import avatarThinking from './assets/guide-avatar/avatar-thinking.png';
import avatarToolCalling from './assets/guide-avatar/avatar-tool-calling.png';
import type { GuideAvatarExpression } from './avatar-state.js';

const expressionSources: Record<GuideAvatarExpression, string> = {
  idle: avatarIdle,
  thinking: avatarThinking,
  'tool-calling': avatarToolCalling,
  'speaking-direct': avatarSpeakingDirect,
  'speaking-with-tools': avatarSpeakingWithTools,
  error: avatarError,
};

export function GuideExpression({ state }: { state: GuideAvatarExpression }) {
  return (
    <span className={`avatar avatar--${state}`} aria-hidden="true">
      <img className="avatar-image" src={expressionSources[state]} alt="" />
    </span>
  );
}

export function GuideFloatingPortrait() {
  return (
    <span className="ball-avatar" aria-hidden="true">
      <img className="avatar-image" src={avatarFloat} alt="" />
    </span>
  );
}
