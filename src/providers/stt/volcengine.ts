import { stt, type APIConnectOptions, type LanguageCode } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import { randomUUID } from 'node:crypto';
import WebSocket, { type RawData } from 'ws';
import type { AppConfig } from '../../config/schema.js';
import {
  createAsrAudioRequest,
  createAsrFullRequest,
  parseVolcengineMessage,
  VolcengineMessageType,
} from '../volcengine/protocol.js';
import { closeWebSocket, connectWebSocket } from '../volcengine/websocket.js';

type SttConfig = AppConfig['volcengine']['stt'];

type AsrSession = {
  socket: WebSocket;
  requestId: string;
  sequence: number;
  pendingAudio?: Buffer;
  finished: Promise<void>;
};

function frameToBuffer(frame: AudioFrame): Buffer {
  return Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
}

export class VolcengineSTT extends stt.STT {
  readonly label = 'volcengine.STT';
  readonly #config: SttConfig;
  readonly #streams = new Set<VolcengineSpeechStream>();

  constructor(config: SttConfig) {
    super({ streaming: true, interimResults: true });
    this.#config = config;
  }

  override get model(): string {
    return this.#config.model;
  }

  override get provider(): string {
    return 'volcengine';
  }

  protected override async _recognize(): Promise<stt.SpeechEvent> {
    throw new Error('火山流式 ASR 不支持非流式识别');
  }

  override stream(options?: { connOptions?: APIConnectOptions }): stt.SpeechStream {
    const stream = new VolcengineSpeechStream(this, this.#config, options?.connOptions, () => {
      this.#streams.delete(stream);
    });
    this.#streams.add(stream);
    return stream;
  }

  override async close(): Promise<void> {
    for (const stream of this.#streams) {
      stream.close();
    }
    this.#streams.clear();
  }
}

class VolcengineSpeechStream extends stt.SpeechStream {
  readonly label = 'volcengine.SpeechStream';
  readonly #config: SttConfig;
  readonly #onClose: () => void;

  constructor(
    service: VolcengineSTT,
    config: SttConfig,
    connOptions: APIConnectOptions | undefined,
    onClose: () => void,
  ) {
    super(service, config.sampleRate, connOptions);
    this.#config = config;
    this.#onClose = onClose;
  }

  override close(): void {
    super.close();
    this.#onClose();
  }

  protected override async run(): Promise<void> {
    let session: AsrSession | undefined;

    try {
      for await (const item of this.input) {
        if (item === VolcengineSpeechStream.FLUSH_SENTINEL) {
          if (session) {
            await this.#finishSession(session);
            session = undefined;
            this.queue.put({ type: stt.SpeechEventType.END_OF_SPEECH });
          }
          continue;
        }

        if (!session) {
          session = await this.#openSession();
          this.queue.put({ type: stt.SpeechEventType.START_OF_SPEECH });
        }
        await this.#sendAudio(session, frameToBuffer(item));
      }
    } finally {
      if (session) {
        closeWebSocket(session.socket);
      }
      this.queue.close();
      this.#onClose();
    }
  }

  async #openSession(): Promise<AsrSession> {
    const requestId = randomUUID();
    const headers: Record<string, string> = {
      'X-Api-Resource-Id': this.#config.resourceId,
      'X-Api-Request-Id': requestId,
      'X-Api-Connect-Id': requestId,
      'X-Api-Sequence': '-1',
    };
    if (this.#config.apiKey) {
      headers['X-Api-Key'] = this.#config.apiKey;
    } else {
      headers['X-Api-App-Key'] = this.#config.appId;
      headers['X-Api-Access-Key'] = this.#config.accessToken;
    }

    const socket = await connectWebSocket(this.#config.endpoint, headers, this.abortSignal);
    const session: AsrSession = {
      socket,
      requestId,
      sequence: 1,
      finished: Promise.resolve(),
    };
    session.finished = this.#listenForResults(session);
    socket.send(
      createAsrFullRequest({
        user: { uid: requestId },
        audio: {
          format: 'pcm',
          codec: 'raw',
          rate: this.#config.sampleRate,
          bits: 16,
          channel: 1,
          language: this.#config.language,
        },
        request: {
          reqid: requestId,
          model_name: this.#config.model,
          show_utterances: true,
          result_type: 'single',
          enable_itn: true,
        },
      }),
    );
    return session;
  }

  async #sendAudio(session: AsrSession, audio: Buffer): Promise<void> {
    if (!session.pendingAudio) {
      session.pendingAudio = audio;
      return;
    }

    session.sequence += 1;
    session.socket.send(createAsrAudioRequest(session.pendingAudio, session.sequence, false));
    session.pendingAudio = audio;
  }

  async #finishSession(session: AsrSession): Promise<void> {
    session.sequence += 1;
    session.socket.send(
      createAsrAudioRequest(session.pendingAudio ?? Buffer.alloc(0), session.sequence, true),
    );
    await session.finished;
    closeWebSocket(session.socket);
  }

  #listenForResults(session: AsrSession): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const abort = () => closeWebSocket(session.socket);
      const onMessage = (data: RawData) => {
        try {
          const input = Array.isArray(data)
            ? Buffer.concat(data)
            : Buffer.isBuffer(data)
              ? data
              : Buffer.from(data);
          const message = parseVolcengineMessage(input);
          if (message.type === VolcengineMessageType.ServerError) {
            reject(new Error(`火山 ASR 错误：${message.errorCode ?? 'unknown'}`));
            return;
          }
          if (message.payload.length > 0) {
            this.#emitTranscripts(message.payload, session.requestId);
          }
          if (message.sequence !== undefined && message.sequence < 0) {
            resolve();
          }
        } catch (error) {
          reject(error);
        }
      };
      const onError = (error: Error) => reject(error);
      const onClose = () => resolve();

      session.socket.on('message', onMessage);
      session.socket.once('error', onError);
      session.socket.once('close', onClose);
      this.abortSignal.addEventListener('abort', abort, { once: true });
    });
  }

  #emitTranscripts(payload: Buffer, requestId: string): void {
    let body: unknown;
    try {
      body = JSON.parse(payload.toString('utf8'));
    } catch {
      return;
    }
    if (!body || typeof body !== 'object') {
      return;
    }

    const result = (body as { result?: unknown }).result;
    const firstResult = Array.isArray(result) ? result[0] : result;
    if (!firstResult || typeof firstResult !== 'object') {
      return;
    }
    const utterances = (firstResult as { utterances?: unknown }).utterances;
    if (!Array.isArray(utterances)) {
      return;
    }

    for (const utterance of utterances) {
      if (!utterance || typeof utterance !== 'object') {
        continue;
      }
      const text = String((utterance as { text?: unknown }).text ?? '').trim();
      if (!text) {
        continue;
      }
      const definite = (utterance as { definite?: unknown }).definite === true;
      this.queue.put({
        type: definite
          ? stt.SpeechEventType.FINAL_TRANSCRIPT
          : stt.SpeechEventType.INTERIM_TRANSCRIPT,
        alternatives: [
          {
            text,
            language: this.#config.language as LanguageCode,
            startTime: 0,
            endTime: 0,
            confidence: 0,
          },
        ],
        requestId,
      });
    }
  }
}
