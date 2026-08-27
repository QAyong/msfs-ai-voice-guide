import { AudioByteStream, tts, type APIConnectOptions } from '@livekit/agents';
import type { AppConfig } from '../../config/schema.js';
import { runVolcengineTtsSession } from '../volcengine/tts-session.js';

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
    let lastFrame: Awaited<ReturnType<AudioByteStream['write']>>[number] | undefined;
    let requestId = 'volcengine-tts';

    try {
      const audio = new AudioByteStream(this.#config.sampleRate, 1);
      await runVolcengineTtsSession(this.#config, this.inputText, {
        signal: this.abortSignal,
        onAudio: (payload, sessionId) => {
          requestId = sessionId;
          const data = payload.buffer.slice(
            payload.byteOffset,
            payload.byteOffset + payload.byteLength,
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
        },
      });

      for (const frame of audio.flush()) {
        if (lastFrame) {
          this.queue.put({
            requestId,
            segmentId: requestId,
            frame: lastFrame,
            final: false,
          });
        }
        lastFrame = frame;
      }
      if (lastFrame) {
        this.queue.put({
          requestId,
          segmentId: requestId,
          frame: lastFrame,
          final: true,
        });
      }
    } finally {
      this.queue.close();
    }
  }
}
