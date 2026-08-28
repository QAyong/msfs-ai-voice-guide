import type { ReceivedMessage } from '@livekit/components-react';
import type { Participant } from 'livekit-client';
import { describe, expect, it } from 'vitest';
import { exploreNarrationPromptMarker } from '../../shared/explore-contracts.js';
import {
  createDisplayMessages,
  mergeAdjacentUserTranscripts,
  shouldAttachSourcePreview,
} from '../../desktop/renderer/src/session-messages.js';

const participant = (identity: string) => ({ identity }) as Participant;

describe('official session message display', () => {
  it('merges adjacent local ASR sentences into one user message', () => {
    const messages: ReceivedMessage[] = [
      {
        id: 'voice-sentence-1',
        message: '你现在给我设置往西边飞。',
        timestamp: 10_000,
        type: 'userTranscript',
        from: participant('desktop-user'),
      },
      {
        id: 'voice-sentence-2',
        message: '现在高度多少？',
        timestamp: 10_005,
        type: 'userTranscript',
        from: participant('desktop-user'),
      },
    ];

    expect(mergeAdjacentUserTranscripts(messages, 'desktop-user')).toEqual([
      {
        ...messages[0],
        message: '你现在给我设置往西边飞。现在高度多少？',
      },
    ]);
    expect(createDisplayMessages(messages, 'desktop-user', {})).toEqual([
      {
        id: 'voice-sentence-1',
        role: 'user',
        sourcePreview: null,
        text: '你现在给我设置往西边飞。现在高度多少？',
      },
    ]);
  });

  it('does not merge separate turns or another participant transcript', () => {
    const messages: ReceivedMessage[] = [
      {
        id: 'voice-first',
        message: '第一句话',
        timestamp: 10_000,
        type: 'userTranscript',
        from: participant('desktop-user'),
      },
      {
        id: 'voice-other',
        message: '别人的话',
        timestamp: 10_005,
        type: 'userTranscript',
        from: participant('another-user'),
      },
      {
        id: 'voice-second-turn',
        message: '第二句话',
        timestamp: 12_500,
        type: 'userTranscript',
        from: participant('desktop-user'),
      },
    ];

    expect(mergeAdjacentUserTranscripts(messages, 'desktop-user')).toEqual(messages);
  });

  it('shows typed local input with voice transcriptions in one conversation', () => {
    const messages: ReceivedMessage[] = [
      {
        id: 'typed-user',
        message: '  苏黎世湖有多深？  ',
        timestamp: 1,
        type: 'chatMessage',
        from: participant('desktop-user'),
      },
      {
        id: 'voice-user',
        message: '再介绍一下周围的山。',
        timestamp: 2,
        type: 'userTranscript',
        from: participant('desktop-user'),
      },
      {
        id: 'agent-answer',
        message: '苏黎世湖最深处约为一百四十米。',
        timestamp: 3,
        type: 'agentTranscript',
        from: participant('guide-agent'),
      },
    ];

    expect(createDisplayMessages(messages, 'desktop-user', {})).toEqual([
      {
        id: 'typed-user',
        role: 'user',
        sourcePreview: null,
        text: '苏黎世湖有多深？',
      },
      {
        id: 'voice-user',
        role: 'user',
        sourcePreview: null,
        text: '再介绍一下周围的山。',
      },
      {
        id: 'agent-answer',
        role: 'assistant',
        sourcePreview: null,
        text: '苏黎世湖最深处约为一百四十米。',
      },
    ]);
  });

  it('keeps sources on agent messages and never attaches them to user input', () => {
    const messages: ReceivedMessage[] = [
      {
        id: 'user-message',
        message: '查询今天的天气',
        timestamp: 1,
        type: 'chatMessage',
        from: participant('desktop-user'),
      },
      {
        id: 'agent-message',
        message: '今天有小雨。',
        timestamp: 2,
        type: 'agentTranscript',
        from: participant('guide-agent'),
      },
    ];
    const source = {
      rank: 1,
      siteName: '示例天气站',
      title: '今日天气',
      url: 'https://example.com/weather',
      openMode: 'in_app' as const,
    };
    const preview = { type: 'guide.sources' as const, query: '今日天气', sources: [source] };

    expect(
      createDisplayMessages(messages, 'desktop-user', {
        'user-message': preview,
        'agent-message': preview,
      }),
    ).toEqual([
      {
        id: 'user-message',
        role: 'user',
        sourcePreview: null,
        text: '查询今天的天气',
      },
      {
        id: 'agent-message',
        role: 'assistant',
        sourcePreview: preview,
        text: '今天有小雨。',
      },
    ]);
  });

  it('shows the localized introduction label instead of the hidden narration prompt', () => {
    const messages: ReceivedMessage[] = [
      {
        id: 'narration-user',
        message: `${exploreNarrationPromptMarker}\nsecret prompt context`,
        timestamp: 1,
        type: 'chatMessage',
        from: participant('desktop-user'),
      },
    ];

    expect(createDisplayMessages(messages, 'desktop-user', {}, 8, 'Start introduction')).toEqual([
      {
        id: 'narration-user',
        role: 'user',
        sourcePreview: null,
        text: 'Start introduction',
      },
    ]);
  });

  it('ignores empty messages and retains only the requested recent window', () => {
    const messages: ReceivedMessage[] = [
      {
        id: 'empty',
        message: '   ',
        timestamp: 0,
        type: 'chatMessage',
        from: participant('desktop-user'),
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `message-${index}`,
        message: `消息 ${index}`,
        timestamp: index + 1,
        type: 'chatMessage' as const,
        from: participant('desktop-user'),
      })),
    ];

    expect(
      createDisplayMessages(messages, 'desktop-user', {}, 3).map((message) => message.id),
    ).toEqual(['message-7', 'message-8', 'message-9']);
  });

  it('retains the complete current-session history when no limit is provided', () => {
    const messages: ReceivedMessage[] = Array.from({ length: 9 }, (_, index) => ({
      id: `message-${index}`,
      message: `消息 ${index}`,
      timestamp: index,
      type: 'chatMessage' as const,
      from: participant('desktop-user'),
    }));

    expect(
      createDisplayMessages(messages, 'desktop-user', {}).map((message) => message.id),
    ).toEqual(Array.from({ length: 9 }, (_, index) => `message-${index}`));
  });

  it('attaches a preview only to the answer created or continued after the tool call', () => {
    const pending = {
      anchorMessageId: 'acknowledgement',
      anchorMessageText: '我来查一下。',
      receivedDuringTurn: true,
    };

    expect(
      shouldAttachSourcePreview(
        pending,
        { id: 'acknowledgement', text: '我来查一下。' },
        'thinking',
      ),
    ).toBe(false);
    expect(
      shouldAttachSourcePreview(pending, { id: 'answer', text: '查询结果如下。' }, 'speaking'),
    ).toBe(true);
    expect(
      shouldAttachSourcePreview(
        pending,
        { id: 'acknowledgement', text: '我来查一下。查询结果如下。' },
        'speaking',
      ),
    ).toBe(true);
    expect(
      shouldAttachSourcePreview(
        pending,
        { id: 'acknowledgement', text: '我来查一下。' },
        'listening',
      ),
    ).toBe(true);
  });
});
