import { describe, expect, it } from 'vitest';
import { ExploreContextCache } from '../../src/explore/context-cache.js';
import { ExploreNarrationController } from '../../src/explore/narration-controller.js';
import { ExploreRequestCoordinator } from '../../src/explore/request-coordinator.js';

const request = {
  recentConversation: [{ id: 'm1', role: 'user' as const, text: '介绍一下这里。' }],
  scope: 'current_context' as const,
  locale: 'zh-CN' as const,
};

const msfs = {
  capturedAt: '2026-08-21T00:00:00.000Z',
  position: { latitude: 31.2304, longitude: 121.4737 },
  place: { country: '中国', city: '上海' },
};

describe('ExploreNarrationController', () => {
  it('returns a prompt and context identity without invoking the encyclopedia planner', async () => {
    const controller = new ExploreNarrationController({
      getMsfsContext: async () => msfs,
      contextCache: new ExploreContextCache(),
    });

    const response = await controller.execute(request);

    expect(response).toMatchObject({ ok: true });
    if (response.ok) {
      expect(response.contextId).toBeTruthy();
      expect(response.narrationId).toBeTruthy();
      expect(response.prompt).toContain('Start introduction');
      expect(response.prompt).toContain('上海');
    }
  });

  it('can narrate from MSFS-only context', async () => {
    const controller = new ExploreNarrationController({ getMsfsContext: async () => msfs });

    const response = await controller.execute({ ...request, recentConversation: [] });

    expect(response.ok).toBe(true);
  });

  it('returns no_context when neither conversation nor current MSFS data exists', async () => {
    const controller = new ExploreNarrationController({ getMsfsContext: async () => undefined });

    await expect(controller.execute({ ...request, recentConversation: [] })).resolves.toMatchObject(
      {
        ok: false,
        code: 'no_context',
      },
    );
  });

  it('shares the busy gate with encyclopedia exploration and supports cancellation', async () => {
    const coordinator = new ExploreRequestCoordinator();
    let resolveContext!: () => void;
    const pendingContext = new Promise<void>((resolve) => {
      resolveContext = resolve;
    });
    const controller = new ExploreNarrationController({
      coordinator,
      getMsfsContext: async (signal) => {
        await pendingContext;
        if (signal.aborted) throw new DOMException('cancelled', 'AbortError');
        return msfs;
      },
    });

    const pending = controller.execute(request);
    await Promise.resolve();
    await expect(controller.execute(request)).resolves.toMatchObject({ ok: false, code: 'busy' });
    expect(controller.cancel()).toBe(true);
    resolveContext();
    await expect(pending).resolves.toMatchObject({ ok: false, code: 'cancelled' });
  });
});
