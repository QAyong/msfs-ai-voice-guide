import { llm } from '@livekit/agents';
import { z } from 'zod';
import type { SearchService } from '../search/service.js';

const parameters = z.object({
  query: z
    .string()
    .trim()
    .min(2)
    .max(500)
    .describe('要从公开网页查询的问题，可包括天气、新闻、活动、规则、地点或知识主题。'),
  site: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .describe('可选的指定来源域名，例如 whc.unesco.org。')
    .optional(),
});

export function createSearchWebTool(service: SearchService) {
  return llm.tool({
    name: 'searchWeb',
    description:
      '从公开网页获取模型外部信息。适用于天气、新闻、活动安排、规则变化、地点、人文历史和偏门事实；回答时关注来源时间，只把返回内容表述为联网核实结果。',
    parameters,
    execute: async ({ query, site }) => service.search({ query, ...(site ? { site } : {}) }),
  });
}
