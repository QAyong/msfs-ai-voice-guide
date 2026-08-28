import type { ReceivedMessage } from '@livekit/components-react';
import type { GuideSourcesMessage } from '../../../shared/guide-events.js';
import { isExploreNarrationPrompt } from '../../../shared/explore-contracts.js';

export type DisplayMessage = {
  id: string;
  role: 'user' | 'assistant';
  sourcePreview: GuideSourcesMessage | null;
  text: string;
};

export type PendingSourcePreview = {
  anchorMessageId: string | null;
  anchorMessageText: string;
  receivedDuringTurn: boolean;
};

export function shouldAttachSourcePreview(
  pending: PendingSourcePreview,
  latestAgentMessage: Pick<DisplayMessage, 'id' | 'text'> | null,
  agentState: string,
): boolean {
  if (!latestAgentMessage) return false;
  if (latestAgentMessage.id !== pending.anchorMessageId) return true;
  if (latestAgentMessage.text !== pending.anchorMessageText) return true;
  return pending.receivedDuringTurn && agentState !== 'thinking' && agentState !== 'speaking';
}

export function createDisplayMessages(
  messages: readonly ReceivedMessage[],
  localParticipantIdentity: string,
  sourcesByMessage: Readonly<Record<string, GuideSourcesMessage>>,
  limit?: number,
  narrationLabel = '开启介绍',
): DisplayMessage[] {
  const displayMessages = messages
    .map<DisplayMessage | null>((message) => {
      const rawText = message.message.trim();
      if (!rawText) return null;

      const role =
        message.type === 'agentTranscript' ||
        (message.type !== 'userTranscript' && message.from?.identity !== localParticipantIdentity)
          ? 'assistant'
          : 'user';

      return {
        id: message.id,
        role,
        sourcePreview: role === 'assistant' ? (sourcesByMessage[message.id] ?? null) : null,
        text: isExploreNarrationPrompt(rawText) ? narrationLabel : rawText,
      };
    })
    .filter((message): message is DisplayMessage => message !== null);

  return limit === undefined ? displayMessages : displayMessages.slice(-limit);
}
