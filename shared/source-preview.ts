import { z } from 'zod';
import { guideSourceSchema, guideSourcesMessageSchema } from './guide-events.js';
import { exploreResultSchema } from './explore-contracts.js';
import {
  SOURCE_PAGE_ZOOM_MAX_PERCENT,
  SOURCE_PAGE_ZOOM_MIN_PERCENT,
  SOURCE_PAGE_ZOOM_STEP_PERCENT,
} from './source-page-zoom.js';
import { isSourceReadingMode, type SourceReadingMode } from './source-reading-preferences.js';

export const companionPreviewSchema = z.discriminatedUnion('type', [
  guideSourcesMessageSchema.extend({ type: z.literal('guide.sources') }),
  z.object({ type: z.literal('explore.result'), result: exploreResultSchema }),
]);

export type CompanionPreview = z.infer<typeof companionPreviewSchema>;

export const companionPreviewSources = (preview: CompanionPreview) => {
  if (preview.type === 'guide.sources') return preview.sources;
  return preview.result.topics.flatMap((topic) =>
    topic.cards.map((card, index) =>
      guideSourceSchema.parse({
        rank: index + 1,
        title: card.title,
        siteName: card.siteName,
        url: card.url,
        ...(card.summary ? { summary: card.summary } : {}),
        ...(card.thumbnailUrl ? { thumbnailUrl: card.thumbnailUrl } : {}),
        ...(card.publishTime ? { publishTime: card.publishTime } : {}),
        openMode: 'in_app',
      }),
    ),
  );
};

const sourceSelectionSchema = z.object({
  preview: companionPreviewSchema,
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
  navigation: z
    .object({
      pageTitle: z.string(),
      canGoBack: z.boolean(),
      canGoForward: z.boolean(),
      isLoading: z.boolean(),
      isVideoFullscreen: z.boolean(),
    })
    .optional(),
});

export const sourceWindowStateSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('preview'), preview: companionPreviewSchema }),
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
export type SourceWindowNavigation = NonNullable<
  Extract<SourceWindowState, { mode: 'loading' }>['navigation']
>;

export const sourceMoreMenuActionSchema = z.enum([
  'mobile',
  'desktop',
  'zoom-out',
  'zoom-reset',
  'zoom-in',
  'open-external',
]);

export type SourceMoreMenuAction = z.infer<typeof sourceMoreMenuActionSchema>;

export const sourceMoreMenuStateSchema = z.object({
  locale: z.enum(['zh-CN', 'en-US']),
  readingMode: z.custom<SourceReadingMode>(isSourceReadingMode),
  pageZoomPercent: z
    .number()
    .int()
    .min(SOURCE_PAGE_ZOOM_MIN_PERCENT)
    .max(SOURCE_PAGE_ZOOM_MAX_PERCENT)
    .refine((value) => value % SOURCE_PAGE_ZOOM_STEP_PERCENT === 0),
  canZoomOut: z.boolean(),
  canZoomIn: z.boolean(),
});

export type SourceMoreMenuState = z.infer<typeof sourceMoreMenuStateSchema>;
