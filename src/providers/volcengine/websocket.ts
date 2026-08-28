import WebSocket, { type RawData } from 'ws';

export class WebSocketMessageTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`WebSocket 在 ${timeoutMs}ms 内未收到消息`);
    this.name = 'WebSocketMessageTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

function toBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

export async function connectWebSocket(
  endpoint: string,
  headers: Record<string, string>,
  abortSignal?: AbortSignal,
  timeoutMs = 0,
): Promise<WebSocket> {
  const socket = new WebSocket(endpoint, { headers });
  const abort = () => socket.close();
  abortSignal?.addEventListener('abort', abort, { once: true });

  try {
    await new Promise<void>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onClose = () => {
        cleanup();
        reject(new Error('WebSocket 在连接建立前关闭'));
      };
      const onTimeout = () => {
        cleanup();
        socket.close();
        reject(new WebSocketMessageTimeoutError(timeoutMs));
      };
      const cleanup = () => {
        socket.off('open', onOpen);
        socket.off('error', onError);
        socket.off('close', onClose);
        if (timeout) clearTimeout(timeout);
      };

      socket.once('open', onOpen);
      socket.once('error', onError);
      socket.once('close', onClose);
      if (timeoutMs > 0) {
        timeout = setTimeout(onTimeout, timeoutMs);
      }
    });
    return socket;
  } finally {
    abortSignal?.removeEventListener('abort', abort);
  }
}

export async function readBinaryMessage(
  socket: WebSocket,
  abortSignal?: AbortSignal,
  timeoutMs = 0,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const abort = () => {
      cleanup();
      reject(new Error('WebSocket 请求已取消'));
    };
    const onMessage = (data: RawData) => {
      cleanup();
      resolve(toBuffer(data));
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new Error('WebSocket 在收到完整响应前关闭'));
    };
    const onTimeout = () => {
      cleanup();
      reject(new WebSocketMessageTimeoutError(timeoutMs));
    };
    const cleanup = () => {
      socket.off('message', onMessage);
      socket.off('error', onError);
      socket.off('close', onClose);
      if (timeout) clearTimeout(timeout);
      abortSignal?.removeEventListener('abort', abort);
    };

    socket.once('message', onMessage);
    socket.once('error', onError);
    socket.once('close', onClose);
    abortSignal?.addEventListener('abort', abort, { once: true });
    if (timeoutMs > 0) {
      timeout = setTimeout(onTimeout, timeoutMs);
    }
  });
}

export function closeWebSocket(socket: WebSocket | undefined): void {
  if (socket && socket.readyState < WebSocket.CLOSING) {
    socket.close();
  }
}
