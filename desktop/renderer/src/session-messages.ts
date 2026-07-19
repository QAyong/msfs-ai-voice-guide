import type { ReceivedMessage } from '@livekit/components-react';
import type { GuideSource } from '../../../shared/guide-events.js';

export type DisplayMessage = {
  id: string;
  role: 'user' | 'assistant';
  sources: GuideSource[];
  text: string;
};

export function createDisplayMessages(
  messages: readonly ReceivedMessage[],
  localParticipantIdentity: string,
  sourcesByMessage: Readonly<Record<string, GuideSource[]>>,
  limit = 8,
): DisplayMessage[] {
  return messages
    .map<DisplayMessage | null>((message) => {
      const text = message.message.trim();
      if (!text) return null;

      const role =
        message.type === 'agentTranscript' ||
        (message.type !== 'userTranscript' && message.from?.identity !== localParticipantIdentity)
          ? 'assistant'
          : 'user';

      return {
        id: message.id,
        role,
        sources: role === 'assistant' ? (sourcesByMessage[message.id] ?? []) : [],
        text,
      };
    })
    .filter((message): message is DisplayMessage => message !== null)
    .slice(-limit);
}
