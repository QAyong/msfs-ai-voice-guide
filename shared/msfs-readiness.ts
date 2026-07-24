export type MsfsReadinessStatus = 'ready' | 'simulator_not_ready' | 'cli_unavailable';

export const msfsReadinessAttributes = {
  status: 'guide.msfs.status',
  message: 'guide.msfs.message',
  code: 'guide.msfs.code',
  timestamp: 'guide.msfs.timestamp',
} as const;
