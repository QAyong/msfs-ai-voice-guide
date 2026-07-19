import { z } from 'zod';

export const guideSourceSchema = z.object({
  title: z.string().trim().min(1),
  siteName: z.string().trim().min(1),
  url: z
    .string()
    .url()
    .refine((value) => new URL(value).protocol === 'https:'),
  summary: z.string().trim().min(1).optional(),
  publishTime: z.string().trim().min(1).optional(),
});

export type GuideSource = z.infer<typeof guideSourceSchema>;

export const guideSourcesMessageSchema = z.object({
  type: z.literal('guide.sources'),
  query: z.string().trim().min(1).optional(),
  sources: z.array(guideSourceSchema).max(8),
});

export type GuideSourcesMessage = z.infer<typeof guideSourcesMessageSchema>;

export const guideSourcesTopic = 'msfs.guide.sources';

export function parseGuideSourcesMessage(value: string): GuideSourcesMessage | null {
  try {
    const parsed: unknown = JSON.parse(value);
    const result = guideSourcesMessageSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
