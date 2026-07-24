import { z } from 'zod';
import { msfsReadinessAttributes } from '../../shared/msfs-readiness.js';

export const msfsCliErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
});

export const msfsCliSuccessEnvelopeSchema = z.object({
  id: z.string().min(1),
  ok: z.literal(true),
  data: z.unknown(),
});

export const msfsCliFailureEnvelopeSchema = z.object({
  id: z.string().min(1),
  ok: z.literal(false),
  error: msfsCliErrorSchema,
});

export const msfsCliEnvelopeSchema = z.discriminatedUnion('ok', [
  msfsCliSuccessEnvelopeSchema,
  msfsCliFailureEnvelopeSchema,
]);

export type MsfsCliEnvelope = z.infer<typeof msfsCliEnvelopeSchema>;

export const msfsUnavailableCodeSchema = z.enum([
  'SIM_NOT_READY',
  'SIM_POSITION_UNAVAILABLE',
  'ROUTE_BRIDGE_UNAVAILABLE',
  'ROUTE_TIMEOUT',
  'ROUTE_NOT_FOUND',
  'ROUTE_BRIDGE_VERSION_MISMATCH',
  'EXTERNAL_GEO_CONFIG_INVALID',
  'EXTERNAL_GEO_AUTH_FAILED',
  'EXTERNAL_GEO_UNAVAILABLE',
  'EXTERNAL_GEO_BACKEND_UNAVAILABLE',
  'TRACK_HISTORY_EMPTY',
  'MSFS_CLI_UNAVAILABLE',
  'MSFS_CLI_TIMEOUT',
  'MSFS_CLI_PROTOCOL_ERROR',
]);

export type MsfsUnavailableCode = z.infer<typeof msfsUnavailableCodeSchema>;

export const msfsUnavailableSchema = z.object({
  status: z.literal('unavailable'),
  code: msfsUnavailableCodeSchema,
  message: z.string().min(1),
  source: z.literal('msfs_cli'),
  requestId: z.string().min(1).optional(),
  timestamp: z.string().datetime(),
});

export type MsfsUnavailable = z.infer<typeof msfsUnavailableSchema>;

export type MsfsCommandSuccess<T> = {
  status: 'ok';
  requestId: string;
  data: T;
};

export type MsfsCommandResult<T> = MsfsCommandSuccess<T> | MsfsUnavailable;

export const msfsReadinessSchema = z.object({
  status: z.enum(['ready', 'simulator_not_ready', 'cli_unavailable']),
  message: z.string().min(1),
  code: msfsUnavailableCodeSchema.optional(),
  timestamp: z.string().datetime(),
});

export type MsfsReadiness = z.infer<typeof msfsReadinessSchema>;

export function readinessAttributes(readiness: MsfsReadiness): Record<string, string> {
  return {
    [msfsReadinessAttributes.status]: readiness.status,
    [msfsReadinessAttributes.message]: readiness.message,
    [msfsReadinessAttributes.code]: readiness.code ?? '',
    [msfsReadinessAttributes.timestamp]: readiness.timestamp,
  };
}
