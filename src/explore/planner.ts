import { z } from 'zod';
import type { ExplorePreferences } from '../../shared/explore-contracts.js';
import type { MsfsExploreContext } from '../msfs/explore-context.js';

export const explorePlanSchema = z.object({
  topics: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(120),
        title: z.string().trim().min(1).max(80),
        reason: z.string().trim().min(1).max(180),
        encyclopediaQuery: z.string().trim().min(1).max(120),
        videoQuery: z.string().trim().min(1).max(160),
        alternateNames: z.array(z.string().trim().min(1).max(80)).max(4),
      }),
    )
    .min(2)
    .max(3),
  suggestedPrompts: z.array(z.string().trim().min(2).max(160)).length(3),
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
