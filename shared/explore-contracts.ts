import { z } from 'zod';

const safeWebUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, '必须是 HTTP(S) URL');

export const explorePreferencesSchema = z.object({
  encyclopedia: z.enum(['wikipedia', 'baidu_baike']),
  videoPlatforms: z.array(z.enum(['youtube', 'bilibili'])).max(2),
});

export type ExplorePreferences = z.infer<typeof explorePreferencesSchema>;
export type ExploreVideoPlatform = ExplorePreferences['videoPlatforms'][number];

export const exploreConversationMessageSchema = z.object({
  id: z.string().trim().min(1).max(256),
  role: z.enum(['user', 'assistant']),
  text: z.string().trim().min(1).max(4_000),
});

export const exploreRequestSchema = z.object({
  recentConversation: z.array(exploreConversationMessageSchema).max(16),
  preferences: explorePreferencesSchema,
  locale: z.enum(['zh-CN', 'en-US']),
});

export type ExploreRequest = z.infer<typeof exploreRequestSchema>;

export const exploreCardSchema = z.object({
  id: z.string().trim().min(1).max(160),
  kind: z.enum(['encyclopedia', 'video']),
  topicId: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(240),
  siteName: z.string().trim().min(1).max(100),
  url: safeWebUrlSchema,
  sourceType: z.enum(['direct', 'search_page']).optional(),
  summary: z.string().trim().min(1).max(360).optional(),
  thumbnailUrl: safeWebUrlSchema.optional(),
  author: z.string().trim().min(1).max(120).optional(),
  publishTime: z.string().trim().min(1).max(64).optional(),
});

export type ExploreCard = z.infer<typeof exploreCardSchema>;

export const exploreTopicSchema = z.object({
  id: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(1).max(180),
  cards: z.array(exploreCardSchema).max(12),
});

export type ExploreTopic = z.infer<typeof exploreTopicSchema>;

export const exploreResultSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  topics: z.array(exploreTopicSchema).min(3).max(5),
  suggestedPrompts: z.array(z.string().trim().min(2).max(160)).length(3),
  unavailableProviders: z.array(z.string().trim().min(1).max(80)).max(6).default([]),
});

export type ExploreResult = z.infer<typeof exploreResultSchema>;

export const exploreResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), result: exploreResultSchema, reused: z.boolean() }),
  z.object({
    ok: z.literal(false),
    code: z.enum(['no_context', 'busy', 'configuration', 'planner_failed', 'cancelled']),
    message: z.string().trim().min(1).max(240),
  }),
]);

export type ExploreResponse = z.infer<typeof exploreResponseSchema>;

export const exploreSuggestionSchema = z.object({ text: z.string().trim().min(2).max(160) });
