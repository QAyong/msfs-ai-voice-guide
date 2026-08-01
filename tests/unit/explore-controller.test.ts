import { describe, expect, it } from 'vitest';
import { ExploreController } from '../../desktop/main/explore-controller.js';
import type { ExploreService } from '../../src/explore/service.js';

const request = {
  recentConversation: [{ id: 'one', role: 'user' as const, text: '介绍一下巴黎。' }],
  preferences: { encyclopedia: 'wikipedia' as const, videoPlatforms: [] },
  locale: 'zh-CN' as const,
};

const result = {
  schemaVersion: 1 as const,
  generatedAt: '2026-07-30T00:00:00.000Z',
  topics: [
    { id: 'one', title: '巴黎', reason: '对话主题。', cards: [] },
    { id: 'two', title: '塞纳河', reason: '相关地标。', cards: [] },
    { id: 'three', title: '埃菲尔铁塔', reason: '代表性地标。', cards: [] },
  ],
  suggestedPrompts: ['巴黎为什么建在这里？', '塞纳河如何影响巴黎？', '从空中怎么看巴黎？'],
  unavailableProviders: [],
};

describe('ExploreController', () => {
  it('reuses the last successful result when the conversation and human geography have not changed', async () => {
    let calls = 0;
    const presented: unknown[] = [];
    const service = {
      explore: async () => {
        calls += 1;
        return result;
      },
    } as unknown as ExploreService;
    const controller = new ExploreController({
      createService: async () => service,
      getMsfsContext: async () => ({
        capturedAt: '2026-07-30T00:00:00.000Z',
        place: { country: '法国', city: '巴黎' },
        position: { latitude: 48.8566, longitude: 2.3522 },
      }),
      present: async (value) => {
        presented.push(value);
        return true;
      },
    });

    await expect(controller.execute(request)).resolves.toMatchObject({ ok: true, reused: false });
    await expect(controller.execute(request)).resolves.toMatchObject({ ok: true, reused: true });
    expect(calls).toBe(1);
    expect(presented).toHaveLength(2);
  });

  it('does not require MSFS when submitted conversation is available', async () => {
    const controller = new ExploreController({
      createService: async () => ({ explore: async () => result }) as unknown as ExploreService,
      getMsfsContext: async () => undefined,
      present: async () => true,
    });
    await expect(controller.execute(request)).resolves.toMatchObject({ ok: true });
  });

  it('starts a conversation-led exploration without waiting for a slow MSFS read', async () => {
    let receivedInput: unknown;
    const controller = new ExploreController({
      createService: async () =>
        ({
          explore: async (input: unknown) => {
            receivedInput = input;
            return result;
          },
        }) as unknown as ExploreService,
      getMsfsContext: async () => new Promise<never>(() => undefined),
      present: async () => true,
    });

    await expect(controller.execute(request)).resolves.toMatchObject({ ok: true, reused: false });
    expect(receivedInput).toMatchObject({ recentConversation: [{ text: '介绍一下巴黎。' }] });
    expect(receivedInput).not.toHaveProperty('msfs');
  });
});
