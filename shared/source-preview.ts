import { z } from 'zod';
import { guideSourceSchema, guideSourcesMessageSchema } from './guide-events.js';

export const sourceLayoutModeSchema = z.enum(['desktop', 'portrait']);
export type SourceLayoutMode = z.infer<typeof sourceLayoutModeSchema>;

const sourceSelectionSchema = z.object({
  preview: guideSourcesMessageSchema,
  source: guideSourceSchema,
  currentUrl: z
    .string()
    .url()
    .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
  layoutMode: sourceLayoutModeSchema,
});

export const sourceWindowStateSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('preview'), preview: guideSourcesMessageSchema }),
  sourceSelectionSchema.extend({ mode: z.literal('loading') }),
  sourceSelectionSchema.extend({ mode: z.literal('ready') }),
  sourceSelectionSchema.extend({
    mode: z.literal('error'),
    error: z.enum(['timeout', 'network', 'http', 'blocked', 'renderer']),
    message: z.string().trim().min(1),
    statusCode: z.number().int().min(400).max(599).optional(),
  }),
]);

export type SourceWindowState = z.infer<typeof sourceWindowStateSchema>;
