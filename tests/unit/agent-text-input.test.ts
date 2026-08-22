import { describe, expect, it, vi } from 'vitest';
import { exploreNarrationPromptMarker } from '../../shared/explore-contracts.js';
import { createGuideTextInputCallback } from '../../src/agent/guide-agent.js';

describe('guide text input callback', () => {
  it('forces the narration turn to use no tools while preserving ordinary text behavior', () => {
    const interrupt = vi.fn();
    const generateReply = vi.fn();
    const callback = createGuideTextInputCallback();
    const session = { interrupt, generateReply } as never;

    callback(session, { text: `${exploreNarrationPromptMarker}\nprivate prompt` });
    callback(session, { text: '请介绍一下这里。' });

    expect(interrupt).toHaveBeenCalledTimes(2);
    expect(generateReply).toHaveBeenNthCalledWith(1, {
      userInput: `${exploreNarrationPromptMarker}\nprivate prompt`,
      toolChoice: 'none',
    });
    expect(generateReply).toHaveBeenNthCalledWith(2, { userInput: '请介绍一下这里。' });
  });
});
