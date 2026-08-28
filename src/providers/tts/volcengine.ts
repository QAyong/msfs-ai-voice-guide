import { AudioByteStream, delay, tts, type APIConnectOptions } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../../config/schema.js';
import { runVolcengineTtsSession, VolcengineTtsSession } from '../volcengine/tts-session.js';

type TtsConfig = AppConfig['volcengine']['tts'];

/**
 * Keeps a bursty provider from filling LiveKit's native audio queue faster than
 * the remote participant can hear it.
 */
class RealtimeAudioPacer {
  #nextFrameAt = performance.now();

  async wait(frame: AudioFrame, signal: AbortSignal): Promise<boolean> {
    const waitMs = Math.max(this.#nextFrameAt - performance.now(), 0);
    if (waitMs > 0) {
      try {
        await delay(waitMs, { signal });
      } catch {
        if (signal.aborted) return false;
        throw new Error('TTS 音频节奏控制等待失败');
      }
    }

    if (signal.aborted) return false;
    this.#nextFrameAt =
      Math.max(this.#nextFrameAt, performance.now()) +
      (frame.samplesPerChannel / frame.sampleRate) * 1_000;
    return true;
  }
}

function toArrayBuffer(payload: Buffer): ArrayBuffer {
  return payload.buffer.slice(
    payload.byteOffset,
    payload.byteOffset + payload.byteLength,
  ) as ArrayBuffer;
}

function logTtsEvent(event: string, details: Record<string, unknown>): void {
  console.info(`[volcengine-tts] ${event} ${JSON.stringify(details)}`);
}

export class VolcengineTTS extends tts.TTS {
  readonly label = 'volcengine.TTS';
  readonly #config: TtsConfig;
  readonly #streams = new Set<VolcengineSynthesizeStream>();

  constructor(config: TtsConfig) {
    super(config.sampleRate, 1, { streaming: true });
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

  override stream(options?: { connOptions?: APIConnectOptions }): tts.SynthesizeStream {
    const stream = new VolcengineSynthesizeStream(this, this.#config, options?.connOptions, () =>
      this.#streams.delete(stream),
    );
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
    let lastFrame: AudioFrame | undefined;
    let requestId = 'volcengine-tts';
    let emittedFrames = 0;
    const pacer = new RealtimeAudioPacer();
    const startedAt = performance.now();

    const enqueueFrame = async (frame: AudioFrame, final: boolean, segmentId: string) => {
      if (frame.samplesPerChannel <= 0) return;
      if (!(await pacer.wait(frame, this.abortSignal))) return;
      this.queue.put({
        requestId,
        segmentId,
        frame,
        final,
      });
      emittedFrames += 1;
    };

    try {
      const audio = new AudioByteStream(this.#config.sampleRate, 1);
      const result = await runVolcengineTtsSession(this.#config, this.inputText, {
        signal: this.abortSignal,
        onAudio: async (payload, sessionId) => {
          requestId = sessionId;
          for (const frame of audio.write(toArrayBuffer(payload))) {
            if (lastFrame) {
              await enqueueFrame(lastFrame, false, sessionId);
            }
            lastFrame = frame;
          }
        },
      });

      for (const frame of audio.flush()) {
        if (frame.samplesPerChannel <= 0) continue;
        if (lastFrame) {
          await enqueueFrame(lastFrame, false, requestId);
        }
        lastFrame = frame;
      }
      if (lastFrame) {
        await enqueueFrame(lastFrame, true, requestId);
      }

      logTtsEvent('completed', {
        requestId,
        audioBytes: result.audioBytes,
        audioPackets: result.audioPackets,
        audioFrames: emittedFrames,
        firstAudioDelayMs: result.firstAudioDelayMs,
        maxInterAudioGapMs: result.maxInterAudioGapMs,
        durationMs: Math.round(performance.now() - startedAt),
      });
    } finally {
      this.queue.close();
    }
  }
}

class VolcengineSynthesizeStream extends tts.SynthesizeStream {
  readonly label = 'volcengine.SynthesizeStream';
  readonly #config: TtsConfig;
  readonly #onClose: () => void;

  constructor(
    service: VolcengineTTS,
    config: TtsConfig,
    connOptions: APIConnectOptions | undefined,
    onClose: () => void,
  ) {
    super(service, connOptions);
    this.#config = config;
    this.#onClose = onClose;
  }

  protected override async run(): Promise<void> {
    let lastFrame: AudioFrame | undefined;
    let requestId = 'volcengine-tts';
    let emittedFrames = 0;
    let textChunks = 0;
    const streamId = `tts-${randomUUID()}`;
    const pacer = new RealtimeAudioPacer();
    const startedAt = performance.now();
    const audio = new AudioByteStream(this.#config.sampleRate, 1);

    const enqueueFrame = async (frame: AudioFrame, final: boolean) => {
      if (frame.samplesPerChannel <= 0) return;
      if (!(await pacer.wait(frame, this.abortSignal))) return;
      this.queue.put({
        requestId,
        segmentId: streamId,
        frame,
        final,
      });
      emittedFrames += 1;
    };

    const onAudio = async (payload: Buffer, sessionId: string) => {
      requestId = sessionId;
      for (const frame of audio.write(toArrayBuffer(payload))) {
        if (lastFrame) {
          await enqueueFrame(lastFrame, false);
        }
        lastFrame = frame;
      }
    };

    let session: VolcengineTtsSession | undefined;
    try {
      for await (const input of this.input) {
        if (this.abortSignal.aborted) break;
        if (typeof input !== 'string') break;
        if (!input) continue;
        session ??= await VolcengineTtsSession.connect(this.#config, {
          signal: this.abortSignal,
          onAudio,
        });
        this.markStarted();
        await session.sendText(input);
        textChunks += 1;
      }

      if (this.abortSignal.aborted) return;
      if (!session) {
        this.queue.put(tts.SynthesizeStream.END_OF_STREAM);
        logTtsEvent('stream_completed', {
          streamId,
          textChunks,
          audioBytes: 0,
          audioPackets: 0,
          audioFrames: 0,
          firstAudioDelayMs: null,
          maxInterAudioGapMs: 0,
          durationMs: Math.round(performance.now() - startedAt),
        });
        return;
      }

      const result = await session.finish();
      for (const frame of audio.flush()) {
        if (frame.samplesPerChannel <= 0) continue;
        if (lastFrame) {
          await enqueueFrame(lastFrame, false);
        }
        lastFrame = frame;
      }
      if (lastFrame) {
        await enqueueFrame(lastFrame, true);
      }
      this.queue.put(tts.SynthesizeStream.END_OF_STREAM);

      logTtsEvent('stream_completed', {
        requestId,
        streamId,
        textChunks,
        audioBytes: result.audioBytes,
        audioPackets: result.audioPackets,
        audioFrames: emittedFrames,
        firstAudioDelayMs: result.firstAudioDelayMs,
        maxInterAudioGapMs: result.maxInterAudioGapMs,
        durationMs: Math.round(performance.now() - startedAt),
      });
    } finally {
      await session?.close();
      this.#onClose();
    }
  }
}
