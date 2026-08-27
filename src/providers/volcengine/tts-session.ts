import { randomUUID } from 'node:crypto';
import type WebSocket from 'ws';
import {
  createEventMessage,
  parseVolcengineMessage,
  VolcengineEvent,
  VolcengineMessageType,
} from './protocol.js';
import { closeWebSocket, connectWebSocket, readBinaryMessage } from './websocket.js';

export type VolcengineTtsSessionConfig = {
  appId: string;
  accessToken: string;
  endpoint: string;
  resourceId: string;
  speaker: string;
  sampleRate: number;
};

export type VolcengineTtsSessionOptions = {
  signal?: AbortSignal;
  onAudio?: (payload: Buffer, sessionId: string) => void;
};

export type VolcengineTtsSessionResult = {
  audioBytes: number;
};

export async function runVolcengineTtsSession(
  config: VolcengineTtsSessionConfig,
  text: string,
  options: VolcengineTtsSessionOptions = {},
): Promise<VolcengineTtsSessionResult> {
  const connectId = randomUUID();
  const sessionId = randomUUID();
  let socket: WebSocket | undefined;
  let audioBytes = 0;

  try {
    socket = await connectWebSocket(
      config.endpoint,
      {
        'X-Api-App-Key': config.appId,
        'X-Api-Access-Key': config.accessToken,
        'X-Api-Resource-Id': config.resourceId,
        'X-Api-Connect-Id': connectId,
      },
      options.signal,
    );

    socket.send(createEventMessage(VolcengineEvent.StartConnection, undefined, {}));
    await waitForEvent(socket, VolcengineEvent.ConnectionStarted, options.signal);

    const baseRequest = {
      user: { uid: connectId },
      namespace: 'BidirectionalTTS',
      req_params: {
        speaker: config.speaker,
        audio_params: {
          format: 'pcm',
          sample_rate: config.sampleRate,
          enable_timestamp: true,
        },
        additions: JSON.stringify({ disable_markdown_filter: false }),
      },
    };
    socket.send(
      createEventMessage(VolcengineEvent.StartSession, sessionId, {
        ...baseRequest,
        event: VolcengineEvent.StartSession,
      }),
    );
    await waitForEvent(socket, VolcengineEvent.SessionStarted, options.signal);

    socket.send(
      createEventMessage(VolcengineEvent.TaskRequest, sessionId, {
        ...baseRequest,
        event: VolcengineEvent.TaskRequest,
        req_params: { ...baseRequest.req_params, text },
      }),
    );
    socket.send(createEventMessage(VolcengineEvent.FinishSession, sessionId, {}));

    while (true) {
      const message = parseVolcengineMessage(await readBinaryMessage(socket, options.signal));
      if (message.type === VolcengineMessageType.ServerError) {
        throw new Error(`火山 TTS 错误：${message.errorCode ?? 'unknown'}`);
      }
      if (message.type === VolcengineMessageType.FullServerResponse) {
        if (message.event === VolcengineEvent.SessionFailed) {
          throw new Error(`火山 TTS 会话失败：${message.payload.toString('utf8') || 'unknown'}`);
        }
        if (message.event === VolcengineEvent.SessionFinished) break;
        continue;
      }
      if (message.type !== VolcengineMessageType.AudioOnlyServer || message.payload.length === 0) {
        continue;
      }

      audioBytes += message.payload.length;
      options.onAudio?.(message.payload, sessionId);
    }

    socket.send(createEventMessage(VolcengineEvent.FinishConnection, undefined, {}));
    return { audioBytes };
  } finally {
    closeWebSocket(socket);
  }
}

async function waitForEvent(
  socket: WebSocket,
  expectedEvent: number,
  signal?: AbortSignal,
): Promise<void> {
  while (true) {
    const message = parseVolcengineMessage(await readBinaryMessage(socket, signal));
    if (message.type === VolcengineMessageType.ServerError) {
      throw new Error(`火山 TTS 错误：${message.errorCode ?? 'unknown'}`);
    }
    if (
      message.type === VolcengineMessageType.FullServerResponse &&
      message.event === expectedEvent
    ) {
      return;
    }
    if (
      message.type === VolcengineMessageType.FullServerResponse &&
      (message.event === VolcengineEvent.ConnectionFailed ||
        message.event === VolcengineEvent.SessionFailed)
    ) {
      throw new Error(`火山 TTS 会话失败：${message.payload.toString('utf8') || 'unknown'}`);
    }
  }
}
