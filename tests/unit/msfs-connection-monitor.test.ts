import { describe, expect, it, vi } from 'vitest';
import { MsfsConnectionMonitor } from '../../desktop/main/msfs-connection-monitor.js';

describe('MSFS connection monitor', () => {
  it('hides the status when every MSFS tool is disabled', async () => {
    const execute = vi.fn();
    const onStatus = vi.fn();
    const monitor = new MsfsConnectionMonitor({
      client: { execute } as never,
      isVisible: () => false,
      onStatus,
    });

    const result = await monitor.refresh();
    expect(result.visible).toBe(false);
    expect(result.connected).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith(result);
  });
});
