import { createGuideInstructions } from '../../src/conversation/guide-instructions.js';
import { describe, expect, it } from 'vitest';

describe('createGuideInstructions', () => {
  it('明确第一版不具备模拟器遥测或工具调用能力', () => {
    const instructions = createGuideInstructions();

    expect(instructions).toContain('不要声称你能读取飞机位置、仪表或实时天气');
    expect(instructions).toContain('不要调用或虚构任何工具');
  });
});
