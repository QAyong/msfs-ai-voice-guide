import { createGuideAgent } from '../../src/agent/guide-agent.js';
import { describe, expect, it } from 'vitest';

describe('guide agent composition', () => {
  it('将导游策略保持在会话入口之外', () => {
    const agent = createGuideAgent();

    expect(agent.instructions).toContain('中文模拟飞行导游');
    expect(agent.instructions).toContain('不要调用或虚构任何工具');
  });
});
