import { gunzipSync, gzipSync } from 'node:zlib';

const HEADER_SIZE = 4;

export const VolcengineMessageType = {
  FullClientRequest: 0b0001,
  AudioOnlyClient: 0b0010,
  FullServerResponse: 0b1001,
  AudioOnlyServer: 0b1011,
  ServerError: 0b1111,
} as const;

export const VolcengineMessageFlag = {
  NoSequence: 0b0000,
  PositiveSequence: 0b0001,
  NegativeSequence: 0b0011,
  WithEvent: 0b0100,
} as const;

export const VolcengineEvent = {
  StartConnection: 1,
  FinishConnection: 2,
  ConnectionStarted: 50,
  ConnectionFailed: 51,
  ConnectionFinished: 52,
  StartSession: 100,
  CancelSession: 101,
  FinishSession: 102,
  SessionStarted: 150,
  SessionCanceled: 151,
  SessionFinished: 152,
  SessionFailed: 153,
  TaskRequest: 200,
} as const;

export type VolcengineMessage = {
  type: number;
  flag: number;
  event?: number;
  sequence?: number;
  errorCode?: number;
  payload: Buffer;
};

function writeInt32(value: number): Buffer {
  const output = Buffer.alloc(4);
  output.writeInt32BE(value);
  return output;
}

function writeUInt32(value: number): Buffer {
  const output = Buffer.alloc(4);
  output.writeUInt32BE(value);
  return output;
}

function writeSizedText(value: string): Buffer {
  const text = Buffer.from(value, 'utf8');
  return Buffer.concat([writeUInt32(text.length), text]);
}

function hasSequence(flag: number): boolean {
  return (
    flag === VolcengineMessageFlag.PositiveSequence ||
    flag === VolcengineMessageFlag.NegativeSequence
  );
}

function eventHasSessionId(event: number): boolean {
  const connectionEvents: readonly number[] = [
    VolcengineEvent.StartConnection,
    VolcengineEvent.FinishConnection,
    VolcengineEvent.ConnectionStarted,
    VolcengineEvent.ConnectionFailed,
  ];
  return !connectionEvents.includes(event);
}

function eventHasConnectId(event: number): boolean {
  const events: readonly number[] = [
    VolcengineEvent.ConnectionStarted,
    VolcengineEvent.ConnectionFailed,
    VolcengineEvent.ConnectionFinished,
  ];
  return events.includes(event);
}

export function createAsrFullRequest(payload: unknown, sequence = 1): Buffer {
  const body = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
  return Buffer.concat([
    Buffer.from([0x11, 0x11, 0x11, 0x00]),
    writeInt32(sequence),
    writeUInt32(body.length),
    body,
  ]);
}

export function createAsrAudioRequest(audio: Buffer, sequence: number, final: boolean): Buffer {
  const body = gzipSync(audio);
  const signedSequence = final ? -Math.abs(sequence) : Math.abs(sequence);
  const flag = final
    ? VolcengineMessageFlag.NegativeSequence
    : VolcengineMessageFlag.PositiveSequence;
  return Buffer.concat([
    Buffer.from([0x11, (VolcengineMessageType.AudioOnlyClient << 4) | flag, 0x01, 0x00]),
    writeInt32(signedSequence),
    writeUInt32(body.length),
    body,
  ]);
}

export function createEventMessage(
  event: number,
  sessionId: string | undefined,
  payload: unknown,
): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const parts = [
    Buffer.from([
      0x11,
      (VolcengineMessageType.FullClientRequest << 4) | VolcengineMessageFlag.WithEvent,
      0x10,
      0x00,
    ]),
    writeInt32(event),
  ];

  if (eventHasSessionId(event)) {
    if (!sessionId) {
      throw new Error('该火山事件必须提供 sessionId');
    }
    parts.push(writeSizedText(sessionId));
  }

  parts.push(writeUInt32(body.length), body);
  return Buffer.concat(parts);
}

export function parseVolcengineMessage(input: Buffer): VolcengineMessage {
  if (input.length < HEADER_SIZE) {
    throw new Error('火山二进制消息长度不足');
  }

  const headerSize = (input[0]! & 0x0f) * 4;
  if (headerSize < HEADER_SIZE || input.length < headerSize) {
    throw new Error('火山二进制消息头无效');
  }

  const type = input[1]! >> 4;
  const flag = input[1]! & 0x0f;
  const compression = input[2]! & 0x0f;
  let offset = headerSize;
  let sequence: number | undefined;
  let errorCode: number | undefined;
  let event: number | undefined;

  const sequenceMessageTypes: readonly number[] = [
    VolcengineMessageType.FullClientRequest,
    VolcengineMessageType.FullServerResponse,
    VolcengineMessageType.AudioOnlyClient,
    VolcengineMessageType.AudioOnlyServer,
  ];
  const requiresSequence = sequenceMessageTypes.includes(type);
  if (requiresSequence && hasSequence(flag)) {
    sequence = input.readInt32BE(offset);
    offset += 4;
  } else if (type === VolcengineMessageType.ServerError) {
    errorCode = input.readUInt32BE(offset);
    offset += 4;
  }

  if (flag === VolcengineMessageFlag.WithEvent) {
    event = input.readInt32BE(offset);
    offset += 4;
    if (eventHasSessionId(event)) {
      const length = input.readUInt32BE(offset);
      offset += 4 + length;
    }
    if (eventHasConnectId(event)) {
      const length = input.readUInt32BE(offset);
      offset += 4 + length;
    }
  }

  if (offset + 4 > input.length) {
    throw new Error('火山二进制消息缺少 payload 长度');
  }
  const payloadLength = input.readUInt32BE(offset);
  offset += 4;
  if (offset + payloadLength > input.length) {
    throw new Error('火山二进制消息 payload 不完整');
  }

  const rawPayload = input.subarray(offset, offset + payloadLength);
  const payload =
    compression === 0b0001 && rawPayload.length > 0 ? gunzipSync(rawPayload) : rawPayload;
  return {
    type,
    flag,
    ...(event === undefined ? {} : { event }),
    ...(sequence === undefined ? {} : { sequence }),
    ...(errorCode === undefined ? {} : { errorCode }),
    payload,
  };
}
