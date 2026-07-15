import { AudioByteStream, tts, type APIConnectOptions } from '@livekit/agents';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../../config/schema.js';
import {
  createEventMessage,
  parseVolcengineMessage,
  VolcengineEvent,
  VolcengineMessageType,
} from '../volcengine/protocol.js';
import { closeWebSocket, connectWebSocket, readBinaryMessage } from '../volcengine/websocket.js';

type TtsConfig = AppConfig['volcengine']['tts'];

export class VolcengineTTS extends tts.TTS {
  readonly label = 'volcengine.TTS';
  readonly #config: TtsConfig;

  constructor(config: TtsConfig) {
    super(config.sampleRate, 1, { streaming: false });
    this.#config = config;
  }

  override get model(): string {
    return 'volcengine-bidirectional-tts';
  }

  override get provider(): string {
    return 'volcengine';
  }

  override synthesize(
    text: string,
    connOptions?: APIConnectOptions,
    abortSignal?: AbortSignal,
  ): tts.ChunkedStream {
    return new VolcengineChunkedStream(this, this.#config, text, connOptions, abortSignal);
  }

  override stream(): tts.SynthesizeStream {
    throw new Error('第一版火山 TTS 适配器不支持文本流式输入');
  }

  override async close(): Promise<void> {
    // 每次合成使用独立 WebSocket，不保留可关闭的共享连接。
  }
}

class VolcengineChunkedStream extends tts.ChunkedStream {
  readonly label = 'volcengine.ChunkedStream';
  readonly #config: TtsConfig;

  constructor(
    service: VolcengineTTS,
    config: TtsConfig,
    text: string,
    connOptions: APIConnectOptions | undefined,
    abortSignal: AbortSignal | undefined,
  ) {
    super(text, service, connOptions, abortSignal);
    this.#config = config;
  }

  protected override async run(): Promise<void> {
    const connectId = randomUUID();
    const sessionId = randomUUID();
    let socket;
    let lastFrame: Awaited<ReturnType<AudioByteStream['write']>>[number] | undefined;

    try {
      socket = await connectWebSocket(
        this.#config.endpoint,
        {
          'X-Api-App-Key': this.#config.appId,
          'X-Api-Access-Key': this.#config.accessToken,
          'X-Api-Resource-Id': this.#config.resourceId,
          'X-Api-Connect-Id': connectId,
        },
        this.abortSignal,
      );

      socket.send(createEventMessage(VolcengineEvent.StartConnection, undefined, {}));
      await this.#waitForEvent(socket, VolcengineEvent.ConnectionStarted);

      const baseRequest = {
        user: { uid: connectId },
        namespace: 'BidirectionalTTS',
        req_params: {
          speaker: this.#config.speaker,
          audio_params: {
            format: 'pcm',
            sample_rate: this.#config.sampleRate,
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
      await this.#waitForEvent(socket, VolcengineEvent.SessionStarted);

      socket.send(
        createEventMessage(VolcengineEvent.TaskRequest, sessionId, {
          ...baseRequest,
          event: VolcengineEvent.TaskRequest,
          req_params: { ...baseRequest.req_params, text: this.inputText },
        }),
      );
      socket.send(createEventMessage(VolcengineEvent.FinishSession, sessionId, {}));

      const audio = new AudioByteStream(this.#config.sampleRate, 1);
      while (true) {
        const message = parseVolcengineMessage(await readBinaryMessage(socket, this.abortSignal));
        if (message.type === VolcengineMessageType.ServerError) {
          throw new Error(`火山 TTS 错误：${message.errorCode ?? 'unknown'}`);
        }
        if (message.type === VolcengineMessageType.FullServerResponse) {
          if (message.event === VolcengineEvent.SessionFailed) {
            throw new Error(`火山 TTS 会话失败：${message.payload.toString('utf8') || 'unknown'}`);
          }
          if (message.event === VolcengineEvent.SessionFinished) {
            break;
          }
          continue;
        }
        if (
          message.type !== VolcengineMessageType.AudioOnlyServer ||
          message.payload.length === 0
        ) {
          continue;
        }

        const data = message.payload.buffer.slice(
          message.payload.byteOffset,
          message.payload.byteOffset + message.payload.byteLength,
        ) as ArrayBuffer;
        for (const frame of audio.write(data)) {
          if (lastFrame) {
            this.queue.put({
              requestId: sessionId,
              segmentId: sessionId,
              frame: lastFrame,
              final: false,
            });
          }
          lastFrame = frame;
        }
      }

      for (const frame of audio.flush()) {
        if (lastFrame) {
          this.queue.put({
            requestId: sessionId,
            segmentId: sessionId,
            frame: lastFrame,
            final: false,
          });
        }
        lastFrame = frame;
      }
      if (lastFrame) {
        this.queue.put({
          requestId: sessionId,
          segmentId: sessionId,
          frame: lastFrame,
          final: true,
        });
      }
      socket.send(createEventMessage(VolcengineEvent.FinishConnection, undefined, {}));
    } finally {
      closeWebSocket(socket);
      this.queue.close();
    }
  }

  async #waitForEvent(
    socket: Awaited<ReturnType<typeof connectWebSocket>>,
    expectedEvent: number,
  ): Promise<void> {
    while (true) {
      const message = parseVolcengineMessage(await readBinaryMessage(socket, this.abortSignal));
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
        message.event === VolcengineEvent.SessionFailed
      ) {
        throw new Error(`火山 TTS 会话失败：${message.payload.toString('utf8') || 'unknown'}`);
      }
    }
  }
}
