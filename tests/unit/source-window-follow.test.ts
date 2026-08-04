import { describe, expect, it } from 'vitest';
import {
  shouldFollowAssistantWindow,
  startSourceWindowSession,
  updateSourceWindowFollowMode,
} from '../../desktop/main/source-window-follow.js';

describe('source window following', () => {
  it('follows the assistant when a source window session starts', () => {
    expect(shouldFollowAssistantWindow(startSourceWindowSession())).toBe(true);
  });

  it('continues following after an application-driven companion reposition', () => {
    expect(updateSourceWindowFollowMode('following', true)).toBe('following');
  });

  it('stays freely positioned after the user moves the source window until it closes', () => {
    const free = updateSourceWindowFollowMode('following', false);
    expect(free).toBe('free');
    expect(shouldFollowAssistantWindow(free)).toBe(false);
    expect(startSourceWindowSession()).toBe('following');
  });
});
