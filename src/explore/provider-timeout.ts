export class ExploreProviderTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`探索来源在 ${timeoutMs}ms 内未响应。`);
    this.name = 'ExploreProviderTimeoutError';
  }
}

const abortError = () => new DOMException('Aborted', 'AbortError');

export const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError';

/**
 * Limits one remote provider without cancelling the complete Explore request.
 * The child signal lets fetch-based providers release their in-flight request
 * when the deadline has expired.
 */
export const runWithProviderTimeout = async <T>(
  timeoutMs: number,
  signal: AbortSignal | undefined,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
  if (signal?.aborted) throw abortError();

  const controller = new AbortController();
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort: ((reason: unknown) => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => {
    controller.abort();
    rejectAbort?.(abortError());
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new ExploreProviderTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeoutPromise, abortPromise]);
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (timedOut) throw new ExploreProviderTimeoutError(timeoutMs);
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
};
