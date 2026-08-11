import { z } from 'zod';

export const aboutLinkIdSchema = z.enum(['community', 'tutorial', 'promotion']);

export const aboutLinkSchema = z.object({
  id: aboutLinkIdSchema,
  label: z.string().min(1).max(120),
  description: z.string().min(1).max(240).optional(),
  labelEn: z.string().min(1).max(120).optional(),
  descriptionEn: z.string().min(1).max(240).optional(),
  url: z.url().refine((value) => new URL(value).protocol === 'https:', 'HTTPS URL required'),
  hostname: z.string().min(1).max(255),
});

export const aboutSupportChannelSchema = z.object({
  id: z.enum(['alipay', 'wechat']),
  label: z.string().min(1).max(120),
  labelEn: z.string().min(1).max(120).optional(),
  qrAsset: z.enum(['alipay-qr', 'wechat-qr']),
});

export const aboutInfoSchema = z.object({
  schemaVersion: z.literal(1),
  productName: z.string().min(1).max(120),
  productNameEn: z.string().min(1).max(120).optional(),
  version: z.string().min(1).max(120),
  supportChannels: z.array(aboutSupportChannelSchema).readonly(),
  links: z.array(aboutLinkSchema).readonly(),
});

export const aboutOpenLinkRequestSchema = z.object({ id: aboutLinkIdSchema });

export type AboutInfo = z.infer<typeof aboutInfoSchema>;
export type AboutLink = z.infer<typeof aboutLinkSchema>;
export type AboutLinkId = z.infer<typeof aboutLinkIdSchema>;
export type AboutSupportChannel = z.infer<typeof aboutSupportChannelSchema>;
