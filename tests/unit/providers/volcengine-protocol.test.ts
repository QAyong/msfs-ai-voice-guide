import {
  createAsrAudioRequest,
  createEventMessage,
  parseVolcengineMessage,
  VolcengineEvent,
  VolcengineMessageFlag,
  VolcengineMessageType,
} from '../../../src/providers/volcengine/protocol.js';
import { describe, expect, it } from 'vitest';

describe('Volcengine binary protocol', () => {
  it('使用负序号标记最终 ASR 音频帧', () => {
    const frame = createAsrAudioRequest(Buffer.from([1, 2]), 3, true);

    expect(frame[1]! & 0x0f).toBe(VolcengineMessageFlag.NegativeSequence);
    expect(frame.readInt32BE(4)).toBe(-3);
  });

  it('编码并解析带会话的 TTS 事件', () => {
    const encoded = createEventMessage(VolcengineEvent.StartSession, 'session-1', {
      hello: 'world',
    });
    const parsed = parseVolcengineMessage(encoded);

    expect(parsed.type).toBe(VolcengineMessageType.FullClientRequest);
    expect(parsed.event).toBe(VolcengineEvent.StartSession);
    expect(JSON.parse(parsed.payload.toString('utf8'))).toEqual({ hello: 'world' });
  });
});
