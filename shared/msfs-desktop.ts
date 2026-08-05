import { z } from 'zod';

export const msfsConnectionStatusSchema = z.object({
  visible: z.boolean(),
  connected: z.boolean(),
  message: z.string().min(1),
  timestamp: z.string().datetime(),
});
export type MsfsConnectionStatus = z.infer<typeof msfsConnectionStatusSchema>;

export const msfsDiagnosticCheckIdSchema = z.enum([
  'cli_runtime',
  'simconnect',
  'user_config',
  'community_package',
  'route_bridge',
]);
export type MsfsDiagnosticCheckId = z.infer<typeof msfsDiagnosticCheckIdSchema>;

export const msfsDiagnosticCheckSchema = z.object({
  id: msfsDiagnosticCheckIdSchema,
  status: z.enum(['ok', 'warning', 'error']),
  message: z.string().min(1),
  detail: z.string().optional(),
});
export type MsfsDiagnosticCheck = z.infer<typeof msfsDiagnosticCheckSchema>;

export const msfsConfigurationDiagnosticSchema = z.object({
  status: z.enum(['ready', 'game_not_running', 'needs_setup']),
  message: z.string().min(1),
  checks: z.array(msfsDiagnosticCheckSchema),
  cliPath: z.string().optional(),
  userCfgPath: z.string().optional(),
  communityPackagePath: z.string().optional(),
  checkedAt: z.string().datetime(),
});
export type MsfsConfigurationDiagnostic = z.infer<typeof msfsConfigurationDiagnosticSchema>;
