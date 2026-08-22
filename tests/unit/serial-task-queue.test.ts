import { describe, expect, it } from 'vitest';
import { SerialTaskQueue } from '../../desktop/main/serial-task-queue.js';

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

describe('SerialTaskQueue', () => {
  it('runs overlapping tasks one at a time and keeps their results', async () => {
    const queue = new SerialTaskQueue();
    const events: string[] = [];

    const first = queue.run(async () => {
      events.push('first:start');
      await delay(10);
      events.push('first:end');
      return 'first-result';
    });
    const second = queue.run(async () => {
      events.push('second:start');
      events.push('second:end');
      return 'second-result';
    });

    await expect(first).resolves.toBe('first-result');
    await expect(second).resolves.toBe('second-result');
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('continues with the next task after a failure', async () => {
    const queue = new SerialTaskQueue();
    const next = queue.run(async () => {
      throw new Error('first failed');
    });
    const following = queue.run(async () => 'following-result');

    await expect(next).rejects.toThrow('first failed');
    await expect(following).resolves.toBe('following-result');
  });
});
