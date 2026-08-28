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

const USER_TRANSCRIPT_MERGE_WINDOW_MS = 2_000;

function joinTranscriptText(left: string, right: string): string {
  const first = left.trim();
  const second = right.trim();
  if (!first) return second;
  if (!second) return first;
  if (first === second || first.startsWith(second)) return first;
  if (second.startsWith(first)) return second;

  for (let overlap = Math.min(first.length, second.length); overlap > 0; overlap -= 1) {
    if (first.endsWith(second.slice(0, overlap))) {
      return `${first}${second.slice(overlap)}`;
    }
  }

  const needsSpace = /[A-Za-z0-9]$/u.test(first) && /^[A-Za-z0-9]/u.test(second);
  return needsSpace ? `${first} ${second}` : `${first}${second}`;
}

function canMergeUserTranscripts(
  previous: ReceivedMessage,
  current: ReceivedMessage,
  localParticipantIdentity: string,
): boolean {
  if (previous.type !== 'userTranscript' || current.type !== 'userTranscript') return false;
  if (previous.from?.identity !== localParticipantIdentity) return false;
  if (current.from?.identity !== localParticipantIdentity) return false;
  if (!Number.isFinite(previous.timestamp) || !Number.isFinite(current.timestamp)) return false;

  const gap = current.timestamp - previous.timestamp;
  return gap >= 0 && gap <= USER_TRANSCRIPT_MERGE_WINDOW_MS;
}

export function mergeAdjacentUserTranscripts(
  messages: readonly ReceivedMessage[],
  localParticipantIdentity: string,
): ReceivedMessage[] {
  const merged: ReceivedMessage[] = [];
  let previousInput: ReceivedMessage | undefined;

  for (const message of messages) {
    const previousMerged = merged.at(-1);
    if (
      previousInput &&
      previousMerged &&
      canMergeUserTranscripts(previousInput, message, localParticipantIdentity)
    ) {
      merged[merged.length - 1] = {
        ...previousMerged,
        message: joinTranscriptText(previousMerged.message, message.message),
      };
    } else {
      merged.push(message);
    }
    previousInput = message;
  }

  return merged;
}

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
  const displayMessages = mergeAdjacentUserTranscripts(messages, localParticipantIdentity)
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
