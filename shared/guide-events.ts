import { z } from 'zod';

export const guideSourceSchema = z.object({
  rank: z.number().int().nonnegative(),
  title: z.string().trim().min(1),
  siteName: z.string().trim().min(1),
  url: z
    .string()
    .url()
    .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
  openMode: z.literal('in_app'),
  summary: z.string().trim().min(1).optional(),
  iconUrl: z
    .string()
    .url()
    .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol))
    .optional(),
  thumbnailUrl: z
    .string()
    .url()
    .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol))
    .optional(),
  publishTime: z.string().trim().min(1).optional(),
});

export type GuideSource = z.infer<typeof guideSourceSchema>;

export const guideSourcesMessageSchema = z.object({
  type: z.literal('guide.sources'),
  query: z.string().trim().min(1).optional(),
  requestId: z.string().trim().min(1).optional(),
  sources: z.array(guideSourceSchema).max(10),
});

export type GuideSourcesMessage = z.infer<typeof guideSourcesMessageSchema>;

export const guideSourcesTopic = 'msfs.guide.sources';

export const guideToolEventSchema = z
  .object({
    type: z.literal('guide.tools'),
    tools: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(128),
            isError: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(16),
  })
  .strict();
export type GuideToolEvent = z.infer<typeof guideToolEventSchema>;
export const guideToolEventsTopic = 'msfs.guide.tool-events';

export function parseGuideSourcesMessage(value: string): GuideSourcesMessage | null {
  try {
    const parsed: unknown = JSON.parse(value);
    const result = guideSourcesMessageSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function parseGuideToolEvent(value: string): GuideToolEvent | null {
  try {
    const parsed: unknown = JSON.parse(value);
    const result = guideToolEventSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
