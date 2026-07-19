import type { ReceivedMessage } from '@livekit/components-react';
import type { Participant } from 'livekit-client';
import { describe, expect, it } from 'vitest';
import { createDisplayMessages } from '../../desktop/renderer/src/session-messages.js';

const participant = (identity: string) => ({ identity }) as Participant;

describe('official session message display', () => {
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
        sources: [],
        text: '苏黎世湖有多深？',
      },
      {
        id: 'voice-user',
        role: 'user',
        sources: [],
        text: '再介绍一下周围的山。',
      },
      {
        id: 'agent-answer',
        role: 'assistant',
        sources: [],
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
      siteName: '示例天气站',
      title: '今日天气',
      url: 'https://example.com/weather',
    };

    expect(
      createDisplayMessages(messages, 'desktop-user', {
        'user-message': [source],
        'agent-message': [source],
      }),
    ).toEqual([
      {
        id: 'user-message',
        role: 'user',
        sources: [],
        text: '查询今天的天气',
      },
      {
        id: 'agent-message',
        role: 'assistant',
        sources: [source],
        text: '今天有小雨。',
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
});
