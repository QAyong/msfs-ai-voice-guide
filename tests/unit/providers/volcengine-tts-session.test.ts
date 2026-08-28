import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadableStream } from 'node:stream/web';
import { initializeLogger } from '@livekit/agents';
import {
  parseVolcengineMessage,
  VolcengineEvent,
} from '../../../src/providers/volcengine/protocol.js';

const websocketMock = vi.hoisted(() => ({
  closeWebSocket: vi.fn(),
  connectWebSocket: vi.fn(),
  readBinaryMessage: vi.fn(),
}));

vi.mock('../../../src/providers/volcengine/websocket.js', () => websocketMock);

import { VolcengineTtsSession } from '../../../src/providers/volcengine/tts-session.js';
import { VolcengineTTS } from '../../../src/providers/tts/volcengine.js';

class FakeWebSocket {
  readonly readyState = 1;
  readonly sent: Buffer[] = [];

  send(data: Buffer): void {
    this.sent.push(data);
  }
}

function serverEvent(
  event: number,
  payload: Buffer = Buffer.alloc(0),
  sessionId = 'session-1',
  connectId = 'connect-1',
): Buffer {
  const connectionEvents = new Set<number>([
    VolcengineEvent.StartConnection,
    VolcengineEvent.FinishConnection,
    VolcengineEvent.ConnectionStarted,
    VolcengineEvent.ConnectionFailed,
  ]);
  const parts: Uint8Array[] = [Buffer.from([0x11, 0x94, 0x10, 0x00])];
  const eventBuffer = Buffer.alloc(4);
  eventBuffer.writeInt32BE(event);
  parts.push(eventBuffer);

  if (!connectionEvents.has(event)) {
    const sessionBuffer = Buffer.from(sessionId, 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(sessionBuffer.length);
    parts.push(length, sessionBuffer);
  }
  if (
    event === VolcengineEvent.ConnectionStarted ||
    event === VolcengineEvent.ConnectionFailed ||
    event === VolcengineEvent.ConnectionFinished
  ) {
    const connectBuffer = Buffer.from(connectId, 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(connectBuffer.length);
    parts.push(length, connectBuffer);
  }

  const payloadLength = Buffer.alloc(4);
  payloadLength.writeUInt32BE(payload.length);
  parts.push(payloadLength, payload);
  return Buffer.concat(parts);
}

function serverAudio(payload: Buffer): Buffer {
  const result = Buffer.alloc(8 + payload.length);
  result[0] = 0x11;
  result[1] = 0xb0;
  result.writeUInt32BE(payload.length, 4);
  payload.copy(result, 8);
  return result;
}

const config = {
  appId: 'app-id',
  accessToken: 'access-token',
  endpoint: 'wss://speech.example.test/tts',
  resourceId: 'tts-resource',
  speaker: 'speaker-id',
  sampleRate: 24_000,
};

afterEach(() => {
  vi.resetAllMocks();
});

describe('VolcengineTtsSession', () => {
  it('sends multiple text chunks before finishing and receives audio before session completion', async () => {
    const socket = new FakeWebSocket();
    websocketMock.connectWebSocket.mockResolvedValue(socket);
    websocketMock.readBinaryMessage
      .mockResolvedValueOnce(serverEvent(VolcengineEvent.ConnectionStarted))
      .mockResolvedValueOnce(serverEvent(VolcengineEvent.SessionStarted))
      .mockResolvedValueOnce(serverAudio(Buffer.from([1, 2, 3, 4])))
      .mockResolvedValueOnce(serverAudio(Buffer.from([5, 6, 7, 8])))
      .mockResolvedValueOnce(serverEvent(VolcengineEvent.SessionFinished));
    const audio: Buffer[] = [];

    const session = await VolcengineTtsSession.connect(config, {
      onAudio: (payload) => {
        audio.push(payload);
      },
    });
    await session.sendText('第一段');
    await session.sendText('第二段');
    const result = await session.finish();
    await session.close();

    expect(socket.sent.map((message) => parseVolcengineMessage(message).event)).toEqual([
      VolcengineEvent.StartConnection,
      VolcengineEvent.StartSession,
      VolcengineEvent.TaskRequest,
      VolcengineEvent.TaskRequest,
      VolcengineEvent.FinishSession,
      VolcengineEvent.FinishConnection,
    ]);
    expect(audio).toEqual([Buffer.from([1, 2, 3, 4]), Buffer.from([5, 6, 7, 8])]);
    expect(result.audioBytes).toBe(8);
    expect(result.audioPackets).toBe(2);
    expect(result.firstAudioDelayMs).not.toBeNull();
  });

  it('exposes a LiveKit streaming TTS path and marks the final audio frame', async () => {
    initializeLogger({ pretty: false, level: 'fatal' });
    const socket = new FakeWebSocket();
    websocketMock.connectWebSocket.mockResolvedValue(socket);
    websocketMock.readBinaryMessage
      .mockResolvedValueOnce(serverEvent(VolcengineEvent.ConnectionStarted))
      .mockResolvedValueOnce(serverEvent(VolcengineEvent.SessionStarted))
      .mockResolvedValueOnce(serverAudio(Buffer.alloc(4_800)))
      .mockResolvedValueOnce(serverEvent(VolcengineEvent.SessionFinished));

    const service = new VolcengineTTS(config);
    const stream = service.stream();
    stream.updateInputStream(
      new ReadableStream<string>({
        start(controller) {
          controller.enqueue('第一段');
          controller.enqueue('第二段');
          controller.close();
        },
      }),
    );

    const output = [];
    for await (const item of stream) {
      if (typeof item !== 'symbol') output.push(item);
    }

    expect(service.capabilities.streaming).toBe(true);
    expect(output).toHaveLength(1);
    expect(output[0]?.final).toBe(true);
    expect(socket.sent.map((message) => parseVolcengineMessage(message).event)).toEqual([
      VolcengineEvent.StartConnection,
      VolcengineEvent.StartSession,
      VolcengineEvent.TaskRequest,
      VolcengineEvent.TaskRequest,
      VolcengineEvent.FinishSession,
      VolcengineEvent.FinishConnection,
    ]);
    await service.close();
  });
});
