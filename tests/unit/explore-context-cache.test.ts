import { describe, expect, it } from 'vitest';
import { ExploreContextCache } from '../../src/explore/context-cache.js';
import type { MsfsExploreContext } from '../../src/msfs/explore-context.js';

const conversation = [{ id: 'user-1', role: 'user' as const, text: '介绍一下这里。' }];

const context = (overrides: Partial<MsfsExploreContext> = {}): MsfsExploreContext => ({
  capturedAt: '2026-08-21T00:00:00.000Z',
  position: { latitude: 48.8566, longitude: 2.3522 },
  place: { country: '法国', city: '巴黎' },
  ...overrides,
});

const readWith = (value: MsfsExploreContext | undefined) => async () => value;

describe('ExploreContextCache', () => {
  it('reuses a semantic context identity while replacing it with the latest snapshot', async () => {
    const cache = new ExploreContextCache();
    const first = await cache.get(conversation, readWith(context()), new AbortController().signal);
    const secondMsfs = context({
      capturedAt: '2026-08-21T00:00:01.000Z',
      position: { latitude: 48.8566, longitude: 2.3522, altitudeMeters: 2_000 },
    });
    const second = await cache.get(
      conversation,
      readWith(secondMsfs),
      new AbortController().signal,
    );

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.snapshot.contextId).toBe(first.snapshot.contextId);
    expect(second.snapshot.msfs).toEqual(secondMsfs);
  });

  it('invalidates on ten-kilometre movement and on game POI changes', async () => {
    const cache = new ExploreContextCache();
    const first = await cache.get(conversation, readWith(context()), new AbortController().signal);
    const moved = await cache.get(
      conversation,
      readWith(context({ position: { latitude: 48.9566, longitude: 2.3522 } })),
      new AbortController().signal,
    );
    const poiChanged = await cache.get(
      conversation,
      readWith(
        context({
          gamePois: [
            {
              name: '新地标',
              distanceKm: 4,
              providerSource: 'simulator',
            },
          ],
        }),
      ),
      new AbortController().signal,
    );

    expect(moved.reused).toBe(false);
    expect(moved.snapshot.contextId).not.toBe(first.snapshot.contextId);
    expect(poiChanged.reused).toBe(false);
    expect(poiChanged.snapshot.contextId).not.toBe(moved.snapshot.contextId);
  });

  it('supports MSFS-only context and never reuses missing current data', async () => {
    const cache = new ExploreContextCache();
    const first = await cache.get([], readWith(context()), new AbortController().signal);
    const second = await cache.get([], readWith(undefined), new AbortController().signal);

    expect(first.snapshot.msfs).toBeDefined();
    expect(second.reused).toBe(false);
    expect(second.snapshot.msfs).toBeUndefined();
    expect(second.snapshot.contextId).not.toBe(first.snapshot.contextId);
  });

  it('waits for the current MSFS read before deciding whether to reuse', async () => {
    const cache = new ExploreContextCache();
    await cache.get(conversation, readWith(context()), new AbortController().signal);
    let resolveRead!: (value: MsfsExploreContext) => void;
    const pendingRead = new Promise<MsfsExploreContext>((resolve) => {
      resolveRead = resolve;
    });
    const resultPromise = cache.get(conversation, () => pendingRead, new AbortController().signal);
    let settled = false;
    void resultPromise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    resolveRead(context());
    await expect(resultPromise).resolves.toMatchObject({ reused: true });
  });
});
