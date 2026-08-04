import { createGuideInstructions } from '../../src/conversation/guide-instructions.js';
import { describe, expect, it } from 'vitest';

describe('createGuideInstructions', () => {
  it('定义周晓晓的语言风格', () => {
    const instructions = createGuideInstructions();

    expect(instructions).toContain('正式姓名是周晓晓，日常对话中使用小名“晓晓”');
    expect(instructions).toContain('愿意陪用户一起把问题弄明白');
    expect(instructions).toContain('不刻薄、不卖萌');
    expect(instructions).toContain('不要反复使用同一种开头或固定口头禅');
    expect(instructions).toContain('避免机械重复');
    expect(instructions).toContain('用户想深入了解时，再逐步展开');
    expect(instructions).toContain('默认只用一到三句短句');
    expect(instructions).toContain('不要使用 Markdown 表格、标题、列表');
  });

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

  it('会自然处理语音转写中的误识别', () => {
    const instructions = createGuideInstructions();

    expect(instructions).toContain('用户输入可能来自语音转写');
    expect(instructions).toContain('不要机械地逐字理解转写文本');
    expect(instructions).toContain('不解释内部判断过程');
  });

  it('英文模式要求使用英文检索并优先英文来源', () => {
    const instructions = createGuideInstructions('en-US');

    expect(instructions).toContain('write the search query in English');
    expect(instructions).toContain('Prefer English-language primary sources');
    expect(instructions).toContain('Respond in natural English');
    expect(instructions).toContain('formal Chinese name is Zhou Xiaoxiao');
    expect(instructions).toContain('My name is Xiaoxiao');
    expect(instructions).toContain('no more than 60 English words');
    expect(instructions).toContain('Do not use Markdown tables, headings, lists');
    expect(instructions).not.toMatch(/[\u4e00-\u9fff]/);
  });
});
