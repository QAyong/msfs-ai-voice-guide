import { z } from 'zod';
import { guideSourceSchema, guideSourcesMessageSchema } from './guide-events.js';
import {
  SOURCE_PAGE_ZOOM_MAX_PERCENT,
  SOURCE_PAGE_ZOOM_MIN_PERCENT,
  SOURCE_PAGE_ZOOM_STEP_PERCENT,
} from './source-page-zoom.js';
import { isSourceReadingMode, type SourceReadingMode } from './source-reading-preferences.js';

const sourceSelectionSchema = z.object({
  preview: guideSourcesMessageSchema,
  source: guideSourceSchema,
  currentUrl: z
    .string()
    .url()
    .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
  pageZoomPercent: z
    .number()
    .int()
    .min(SOURCE_PAGE_ZOOM_MIN_PERCENT)
    .max(SOURCE_PAGE_ZOOM_MAX_PERCENT)
    .refine((value) => value % SOURCE_PAGE_ZOOM_STEP_PERCENT === 0),
  readingMode: z.custom<SourceReadingMode>(isSourceReadingMode),
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
