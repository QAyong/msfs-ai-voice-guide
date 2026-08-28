import { randomUUID } from 'node:crypto';
import type WebSocket from 'ws';
import {
  createEventMessage,
  parseVolcengineMessage,
  VolcengineEvent,
  VolcengineMessageType,
} from './protocol.js';
import {
  closeWebSocket,
  connectWebSocket,
  readBinaryMessage,
  WebSocketMessageTimeoutError,
} from './websocket.js';

const TTS_EVENT_TIMEOUT_MS = 10_000;
const TTS_AUDIO_IDLE_TIMEOUT_MS = 10_000;

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
  onAudio?: (payload: Buffer, sessionId: string) => void | Promise<void>;
};

export type VolcengineTtsSessionResult = {
  audioBytes: number;
  audioPackets: number;
  firstAudioDelayMs: number | null;
  maxInterAudioGapMs: number;
  durationMs: number;
};

type VolcengineTtsRequest = {
  user: { uid: string };
  namespace: 'BidirectionalTTS';
  req_params: {
    speaker: string;
    audio_params: {
      format: 'pcm';
      sample_rate: number;
      enable_timestamp: true;
    };
    additions: string;
  };
};

/**
 * A single bidirectional TTS session. Text can be sent in multiple packets while
 * audio is received concurrently. The session is finished only after input ends.
 */
export class VolcengineTtsSession {
  readonly sessionId: string;
  #socket: WebSocket;
  #signal: AbortSignal | undefined;
  #onAudio: VolcengineTtsSessionOptions['onAudio'];
  #baseRequest: VolcengineTtsRequest;
  #receiveTask: Promise<VolcengineTtsSessionResult>;
  #finishSent = false;
  #closed = false;
  #audioBytes = 0;
  #audioPackets = 0;
  #firstAudioAt: number | undefined;
  #lastAudioAt: number | undefined;
  #maxInterAudioGapMs = 0;
  #startedAt = performance.now();

  private constructor(
    socket: WebSocket,
    sessionId: string,
    baseRequest: VolcengineTtsRequest,
    options: VolcengineTtsSessionOptions,
  ) {
    this.#socket = socket;
    this.sessionId = sessionId;
    this.#baseRequest = baseRequest;
    this.#signal = options.signal;
    this.#onAudio = options.onAudio;
    this.#receiveTask = this.#receiveAudio();
  }

  static async connect(
    config: VolcengineTtsSessionConfig,
    options: VolcengineTtsSessionOptions = {},
  ): Promise<VolcengineTtsSession> {
    const connectId = randomUUID();
    const sessionId = randomUUID();
    let socket: WebSocket | undefined;

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
        TTS_EVENT_TIMEOUT_MS,
      );

      socket.send(createEventMessage(VolcengineEvent.StartConnection, undefined, {}));
      await waitForEvent(socket, VolcengineEvent.ConnectionStarted, options.signal);

      const baseRequest: VolcengineTtsRequest = {
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

      return new VolcengineTtsSession(socket, sessionId, baseRequest, options);
    } catch (error) {
      closeWebSocket(socket);
      throw error;
    }
  }

  async sendText(text: string): Promise<void> {
    if (!text || this.#signal?.aborted) return;
    if (this.#closed) throw new Error('火山 TTS 会话已关闭');
    if (this.#finishSent) throw new Error('火山 TTS 会话已结束输入');

    this.#socket.send(
      createEventMessage(VolcengineEvent.TaskRequest, this.sessionId, {
        ...this.#baseRequest,
        event: VolcengineEvent.TaskRequest,
        req_params: { ...this.#baseRequest.req_params, text },
      }),
    );
  }

  async finish(): Promise<VolcengineTtsSessionResult> {
    if (!this.#closed && !this.#finishSent) {
      this.#socket.send(createEventMessage(VolcengineEvent.FinishSession, this.sessionId, {}));
      this.#finishSent = true;
    }

    const result = await this.#receiveTask;
    if (!this.#closed && this.#socket.readyState === 1) {
      this.#socket.send(createEventMessage(VolcengineEvent.FinishConnection, undefined, {}));
    }
    return result;
  }

  async close(): Promise<void> {
    if (!this.#closed) {
      this.#closed = true;
      closeWebSocket(this.#socket);
    }
    await this.#receiveTask.catch(() => undefined);
  }

  async #receiveAudio(): Promise<VolcengineTtsSessionResult> {
    try {
      while (true) {
        const input = await readBinaryMessage(
          this.#socket,
          this.#signal,
          TTS_AUDIO_IDLE_TIMEOUT_MS,
        );
        const message = parseVolcengineMessage(input);

        if (message.type === VolcengineMessageType.ServerError) {
          throw new Error(`火山 TTS 错误：${message.errorCode ?? 'unknown'}`);
        }

        if (message.type === VolcengineMessageType.FullServerResponse) {
          if (message.event === VolcengineEvent.SessionFailed) {
            throw new Error(`火山 TTS 会话失败：${message.payload.toString('utf8') || 'unknown'}`);
          }
          if (message.event === VolcengineEvent.SessionFinished) {
            return {
              audioBytes: this.#audioBytes,
              audioPackets: this.#audioPackets,
              firstAudioDelayMs:
                this.#firstAudioAt === undefined
                  ? null
                  : Math.round(this.#firstAudioAt - this.#startedAt),
              maxInterAudioGapMs: Math.round(this.#maxInterAudioGapMs),
              durationMs: Math.round(performance.now() - this.#startedAt),
            };
          }
          continue;
        }

        if (
          message.type !== VolcengineMessageType.AudioOnlyServer ||
          message.payload.length === 0
        ) {
          continue;
        }

        const now = performance.now();
        this.#firstAudioAt ??= now;
        if (this.#lastAudioAt !== undefined) {
          this.#maxInterAudioGapMs = Math.max(this.#maxInterAudioGapMs, now - this.#lastAudioAt);
        }
        this.#lastAudioAt = now;
        this.#audioBytes += message.payload.length;
        this.#audioPackets += 1;
        await this.#onAudio?.(message.payload, this.sessionId);
      }
    } catch (error) {
      if (error instanceof WebSocketMessageTimeoutError) {
        const phase =
          this.#audioPackets === 0 ? 'TTS_FIRST_AUDIO_TIMEOUT' : 'TTS_FRAME_IDLE_TIMEOUT';
        const details = {
          phase,
          sessionId: this.sessionId,
          audioPackets: this.#audioPackets,
          audioBytes: this.#audioBytes,
          timeoutMs: error.timeoutMs,
        };
        console.warn(`[volcengine-tts] ${phase} ${JSON.stringify(details)}`);
        const timeoutError = new Error(`${phase}: ${error.message}`);
        timeoutError.name = phase;
        throw timeoutError;
      }
      throw error;
    }
  }
}

export async function runVolcengineTtsSession(
  config: VolcengineTtsSessionConfig,
  text: string,
  options: VolcengineTtsSessionOptions = {},
): Promise<VolcengineTtsSessionResult> {
  const session = await VolcengineTtsSession.connect(config, options);
  try {
    await session.sendText(text);
    return await session.finish();
  } finally {
    await session.close();
  }
}

async function waitForEvent(
  socket: WebSocket,
  expectedEvent: number,
  signal?: AbortSignal,
): Promise<void> {
  while (true) {
    const input = await readBinaryMessage(socket, signal, TTS_EVENT_TIMEOUT_MS);
    const message = parseVolcengineMessage(input);
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
