import WebSocket, { type RawData } from 'ws';

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
): Promise<WebSocket> {
  const socket = new WebSocket(endpoint, { headers });
  const abort = () => socket.close();
  abortSignal?.addEventListener('abort', abort, { once: true });

  try {
    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        socket.off('open', onOpen);
        socket.off('error', onError);
      };

      socket.once('open', onOpen);
      socket.once('error', onError);
    });
    return socket;
  } finally {
    abortSignal?.removeEventListener('abort', abort);
  }
}

export async function readBinaryMessage(
  socket: WebSocket,
  abortSignal?: AbortSignal,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
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
    const cleanup = () => {
      socket.off('message', onMessage);
      socket.off('error', onError);
      socket.off('close', onClose);
      abortSignal?.removeEventListener('abort', abort);
    };

    socket.once('message', onMessage);
    socket.once('error', onError);
    socket.once('close', onClose);
    abortSignal?.addEventListener('abort', abort, { once: true });
  });
}

export function closeWebSocket(socket: WebSocket | undefined): void {
  if (socket && socket.readyState < WebSocket.CLOSING) {
    socket.close();
  }
}
