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

  it('keeps distinct final utterances in the same ASR request', () => {
    const finalTranscriptKeys = new Set<string>();
    const first = parseVolcengineUtterances(
      payload([{ definite: true, end_time: 500, start_time: 0, text: '我想往西飞。' }]),
    )[0]!;
    const second = parseVolcengineUtterances(
      payload([{ definite: true, end_time: 1_200, start_time: 600, text: '现在高度多少？' }]),
    )[0]!;

    expect(shouldEmitVolcengineUtterance(first, finalTranscriptKeys)).toBe(true);
    expect(shouldEmitVolcengineUtterance(second, finalTranscriptKeys)).toBe(true);
  });

  it('ignores malformed payloads and empty utterances', () => {
    expect(parseVolcengineUtterances(Buffer.from('invalid'))).toEqual([]);
    expect(parseVolcengineUtterances(payload([{ definite: true, text: ' ' }]))).toEqual([]);
  });
});
