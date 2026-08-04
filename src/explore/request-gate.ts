/** Small per-process queue for public endpoints that do not offer an application key. */
export class RequestGate {
  private tail = Promise.resolve();
  private lastStartedAt = 0;

  constructor(private readonly minimumIntervalMs: number) {}

  async run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    let release: (() => void) | undefined;
    const previous = this.tail;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
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
      return await operation();
    } finally {
      release?.();
    }
  }
}
