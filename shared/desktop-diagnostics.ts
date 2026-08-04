import { z } from 'zod';
import { guideSourcesMessageSchema, guideToolEventSchema } from './guide-events.js';

export const diagnosticConversationRecordSchema = z
  .object({
    id: z.string().trim().min(1).max(256),
    role: z.enum(['user', 'assistant']),
    text: z.string().trim().min(1).max(16_000),
  })
  .strict();
export type DiagnosticConversationRecord = z.infer<typeof diagnosticConversationRecordSchema>;

export const diagnosticToolEventSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('guide.sources'),
      event: guideSourcesMessageSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('guide.tools'),
      event: guideToolEventSchema,
    })
    .strict(),
]);
export type DiagnosticToolEvent = z.infer<typeof diagnosticToolEventSchema>;

export type DiagnosticExportResult =
  | { ok: true; message: string }
  | { cancelled: true; ok: false; message: string }
  | { cancelled?: false; ok: false; message: string };
