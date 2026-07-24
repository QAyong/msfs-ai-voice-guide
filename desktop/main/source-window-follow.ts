export type SourceWindowFollowMode = 'following' | 'free';

export const startSourceWindowSession = (): SourceWindowFollowMode => 'following';

export const updateSourceWindowFollowMode = (
  current: SourceWindowFollowMode,
  movedByApplication: boolean,
): SourceWindowFollowMode => (movedByApplication ? current : 'free');

export const shouldFollowAssistantWindow = (mode: SourceWindowFollowMode) => mode === 'following';
