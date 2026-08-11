import { z } from 'zod';
import type { ExplorePreferences } from '../../shared/explore-contracts.js';
import type { MsfsExploreContext } from '../msfs/explore-context.js';

const normalizeEntryName = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/[\s_\-—–·•:：,，。！？!?()[\]【】]/gu, '')
    .replace(/百科$/u, '')
    .toLocaleLowerCase();

const exploreTopicSchema = z.object({
  id: z.string().trim().min(1).max(120),
  // This is the concrete encyclopedia entry name, not an abstract theme such as "长沙历史".
  title: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(1).max(180),
  encyclopediaQuery: z.string().trim().min(1).max(120),
  encyclopediaFallbackQueries: z.array(z.string().trim().min(1).max(120)).max(3).default([]),
  videoQuery: z.string().trim().min(1).max(160),
  alternateNames: z.array(z.string().trim().min(1).max(80)).max(4),
});

export const explorePlanSchema = z
  .object({
    topics: z.array(exploreTopicSchema).min(3).max(5),
    suggestedPrompts: z.array(z.string().trim().min(2).max(160)).length(3),
    introduction: z.string().trim().max(180).optional(),
  })
  .superRefine((plan, context) => {
    const seenQueries = new Map<string, number>();
    const seenTitles = new Map<string, number>();
    const seenIds = new Map<string, number>();
    for (const [index, topic] of plan.topics.entries()) {
      const normalizedQuery = normalizeEntryName(topic.encyclopediaQuery);
      const previousQueryIndex = seenQueries.get(normalizedQuery);
      if (previousQueryIndex !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['topics', index, 'encyclopediaQuery'],
          message: `百科词条不能与主题 ${previousQueryIndex + 1} 重复`,
        });
      } else {
        seenQueries.set(normalizedQuery, index);
      }

      const normalizedTitle = normalizeEntryName(topic.title);
      const previousTitleIndex = seenTitles.get(normalizedTitle);
      if (previousTitleIndex !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['topics', index, 'title'],
          message: `百科词条标题不能与主题 ${previousTitleIndex + 1} 重复`,
        });
      } else {
        seenTitles.set(normalizedTitle, index);
      }

      const normalizedId = normalizeEntryName(topic.id);
      const previousIdIndex = seenIds.get(normalizedId);
      if (previousIdIndex !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['topics', index, 'id'],
          message: `主题 id 不能与主题 ${previousIdIndex + 1} 重复`,
        });
      } else {
        seenIds.set(normalizedId, index);
      }
    }
  });

export type ExplorePlan = z.infer<typeof explorePlanSchema>;

export type ExplorePlannerInput = {
  recentConversation?: Array<{ role: 'user' | 'assistant'; text: string }>;
  msfs?: MsfsExploreContext;
  preferences: ExplorePreferences;
  locale: 'zh-CN' | 'en-US';
};

export interface ExplorePlanner {
  plan(input: ExplorePlannerInput, signal?: AbortSignal): Promise<ExplorePlan>;
}
