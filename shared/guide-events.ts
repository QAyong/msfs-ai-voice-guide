import { z } from 'zod';

export const guideSourceSchema = z
  .object({
    rank: z.number().int().nonnegative(),
    title: z.string().trim().min(1),
    siteName: z.string().trim().min(1),
    url: z
      .string()
      .url()
      .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
    openMode: z.enum(['in_app', 'external']),
    summary: z.string().trim().min(1).optional(),
    iconUrl: z.string().url().startsWith('https://').optional(),
    thumbnailUrl: z.string().url().startsWith('https://').optional(),
    publishTime: z.string().trim().min(1).optional(),
  })
  .superRefine((source, context) => {
    const protocol = new URL(source.url).protocol;
    if (
      (protocol === 'https:' && source.openMode !== 'in_app') ||
      (protocol === 'http:' && source.openMode !== 'external')
    ) {
      context.addIssue({ code: 'custom', message: '打开方式与来源协议不匹配' });
    }
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

export function parseGuideSourcesMessage(value: string): GuideSourcesMessage | null {
  try {
    const parsed: unknown = JSON.parse(value);
    const result = guideSourcesMessageSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
