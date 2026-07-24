import { createGuideInstructions } from '../../src/conversation/guide-instructions.js';
import { describe, expect, it } from 'vitest';

describe('createGuideInstructions', () => {
  it('明确遥测边界并区分联网证据与模型已有知识', () => {
    const instructions = createGuideInstructions();

    expect(instructions).toContain('只有在相应 MSFS 工具返回 status=ok 时');
    expect(instructions).toContain('EFB 航路只以 getRouteBrief/getNextWaypoint');
    expect(instructions).toContain('不能把国家、城市、自然地貌或 POI 说成 SimConnect 原生数据');
    expect(instructions).toContain('不使用旧缓存、Legacy GPS 或自身知识编造当前飞行数据');
    expect(instructions).toContain('包括天气、新闻、活动安排、规则变化');
    expect(instructions).toContain('说明资料对应的地点和时间');
    expect(instructions).not.toContain('不要声称你能读取模拟器遥测或实时天气');
    expect(instructions).toContain('只有工具返回的资料才能表述为已通过联网资料核实');
    expect(instructions).toContain('可以依据自身已有知识给出概括性回答');
    expect(instructions).toContain('这部分未经联网核实');
  });
});
