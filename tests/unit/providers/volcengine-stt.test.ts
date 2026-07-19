import { describe, expect, it } from 'vitest';
import {
  parseVolcengineUtterances,
  shouldEmitVolcengineUtterance,
} from '../../../src/providers/stt/volcengine.js';

const payload = (utterances: unknown[]) =>
  Buffer.from(JSON.stringify({ result: [{ utterances }] }), 'utf8');

describe('Volcengine STT utterances', () => {
  it('keeps provider timing and creates a stable final-transcript key', () => {
    expect(
      parseVolcengineUtterances(
        payload([
          {
            definite: true,
            end_time: 1_250,
            start_time: 250,
            text: ' 今天天气怎么样？ ',
          },
        ]),
      ),
    ).toEqual([
      {
        endTime: 1.25,
        final: true,
        key: '250:1250:今天天气怎么样？',
        startTime: 0.25,
        text: '今天天气怎么样？',
      },
    ]);
  });

  it('uses provider utterance ids when available', () => {
    expect(
      parseVolcengineUtterances(payload([{ definite: true, id: 'utterance-1', text: '你好。' }]))[0]
        ?.key,
    ).toBe('utterance-1');
  });

  it('emits a final utterance only once within one ASR request', () => {
    const utterance = parseVolcengineUtterances(
      payload([{ definite: true, end_time: 500, start_time: 0, text: '你好。' }]),
    )[0]!;
    const finalTranscriptKeys = new Set<string>();

    expect(shouldEmitVolcengineUtterance(utterance, finalTranscriptKeys)).toBe(true);
    expect(shouldEmitVolcengineUtterance(utterance, finalTranscriptKeys)).toBe(false);
  });

  it('ignores malformed payloads and empty utterances', () => {
    expect(parseVolcengineUtterances(Buffer.from('invalid'))).toEqual([]);
    expect(parseVolcengineUtterances(payload([{ definite: true, text: ' ' }]))).toEqual([]);
  });
});
