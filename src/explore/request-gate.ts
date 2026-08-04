/**
 * Spaces out starts for public endpoints that do not offer an application key.
 *
 * The queue is released as soon as a request starts, rather than when the
 * request finishes. This keeps the public-endpoint rate limit while allowing
 * callers to keep a bounded number of requests in flight concurrently.
 */
export class RequestGate {
  private tail = Promise.resolve();
  private lastStartedAt = 0;

  constructor(private readonly minimumIntervalMs: number) {}

  async run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    let resolveNext: (() => void) | undefined;
    const previous = this.tail;
    this.tail = new Promise<void>((resolve) => {
      resolveNext = resolve;
    });
    await previous;
    let released = false;
    const releaseNext = () => {
      if (released) return;
      released = true;
      resolveNext?.();
    };

    try {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const waitMs = Math.max(0, this.minimumIntervalMs - (Date.now() - this.lastStartedAt));
      if (waitMs) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, waitMs);
          signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
        });
      }
      this.lastStartedAt = Date.now();
      releaseNext();
      return await operation();
    } finally {
      releaseNext();
    }
  }
}
