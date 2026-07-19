import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConnectionState,
  RemoteAudioTrack,
  Room,
  RoomEvent,
  Track,
  type LocalAudioTrack,
  type Participant,
  type RemoteTrack,
} from 'livekit-client';
import {
  guideSourcesTopic,
  parseGuideSourcesMessage,
  type GuideSource,
} from '../../../shared/guide-events.js';
import type { DesktopReadiness } from '../../../shared/desktop-contracts.js';

export type VoiceConnectionState =
  | 'checking'
  | 'setup_required'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export type AgentVoiceState = 'initializing' | 'idle' | 'listening' | 'thinking' | 'speaking';

export type ConversationMessage = {
  id: string;
  role: 'user' | 'agent';
  text: string;
  final: boolean;
  sources: GuideSource[];
};

const transcriptionTopic = 'lk.transcription';
const agentStateAttribute = 'lk.agent.state';
const decoder = new TextDecoder();

const isAgentVoiceState = (value: string | undefined): value is AgentVoiceState =>
  value === 'initializing' ||
  value === 'idle' ||
  value === 'listening' ||
  value === 'thinking' ||
  value === 'speaking';

export const useVoiceSession = (outputVolume: number) => {
  const [connectionState, setConnectionState] = useState<VoiceConnectionState>('checking');
  const [agentState, setAgentState] = useState<AgentVoiceState | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [readiness, setReadiness] = useState<DesktopReadiness | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const roomRef = useRef<Room | null>(null);
  const connectPromiseRef = useRef<Promise<boolean> | null>(null);
  const publishedTrackRef = useRef<LocalAudioTrack | null>(null);
  const pendingSourcesRef = useRef<GuideSource[]>([]);
  const remoteAudioTracksRef = useRef(new Set<RemoteAudioTrack>());
  const outputVolumeRef = useRef(outputVolume);
  const disposedRef = useRef(false);

  useEffect(() => {
    outputVolumeRef.current = outputVolume;
    for (const track of remoteAudioTracksRef.current) track.setVolume(outputVolume);
  }, [outputVolume]);

  const upsertTranscript = useCallback(
    (id: string, role: ConversationMessage['role'], text: string, final: boolean) => {
      if (!text.trim()) return;
      setMessages((current) => {
        const existingIndex = current.findIndex((message) => message.id === id);
        const sources =
          role === 'agent' && final && pendingSourcesRef.current.length > 0
            ? pendingSourcesRef.current
            : existingIndex >= 0
              ? (current[existingIndex]?.sources ?? [])
              : [];
        if (role === 'agent' && final && sources.length > 0) pendingSourcesRef.current = [];
        const nextMessage: ConversationMessage = { id, role, text: text.trim(), final, sources };
        if (existingIndex >= 0) {
          const next = [...current];
          next[existingIndex] = nextMessage;
          return next;
        }
        return [...current, nextMessage].slice(-8);
      });
    },
    [],
  );

  const updateAgentState = useCallback((participant: Participant) => {
    const nextState = participant.attributes[agentStateAttribute];
    if (isAgentVoiceState(nextState)) setAgentState(nextState);
  }, []);

  const attachRemoteAudio = useCallback((track: RemoteTrack) => {
    if (!(track instanceof RemoteAudioTrack)) return;
    remoteAudioTracksRef.current.add(track);
    track.setVolume(outputVolumeRef.current);
    const element = track.attach();
    element.dataset.livekitAgentAudio = 'true';
    element.style.display = 'none';
    document.body.append(element);
  }, []);

  const detachRemoteAudio = useCallback((track: RemoteTrack) => {
    if (!(track instanceof RemoteAudioTrack)) return;
    remoteAudioTracksRef.current.delete(track);
    for (const element of track.detach()) element.remove();
  }, []);

  const disconnectRoom = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    publishedTrackRef.current = null;
    setAgentState(null);
    if (!room) return;
    room.unregisterTextStreamHandler(transcriptionTopic);
    await room.disconnect(false).catch(() => undefined);
    for (const track of remoteAudioTracksRef.current) {
      for (const element of track.detach()) element.remove();
    }
    remoteAudioTracksRef.current.clear();
  }, []);

  const connect = useCallback(async (): Promise<boolean> => {
    if (roomRef.current?.state === ConnectionState.Connected) return true;
    if (connectPromiseRef.current) return connectPromiseRef.current;

    const promise = (async () => {
      setConnectionState('connecting');
      setErrorMessage('');
      setReadiness(null);
      await disconnectRoom();

      const result = await window.desktop?.createLiveKitSession();
      if (!result?.ok) {
        const nextReadiness = result?.readiness ?? {
          status: 'error' as const,
          message: '桌面服务不可用。',
          issues: ['请在 Electron 桌面应用中运行此界面。'],
        };
        setReadiness(nextReadiness);
        setConnectionState(nextReadiness.status === 'setup_required' ? 'setup_required' : 'error');
        setErrorMessage(nextReadiness.message);
        return false;
      }

      const room = new Room({
        adaptiveStream: false,
        dynacast: false,
        stopLocalTrackOnUnpublish: false,
      });
      roomRef.current = room;

      room.on(RoomEvent.Reconnecting, () => setConnectionState('reconnecting'));
      room.on(RoomEvent.Reconnected, () => {
        setConnectionState('connected');
        setErrorMessage('');
      });
      room.on(RoomEvent.Disconnected, () => {
        if (disposedRef.current) return;
        setConnectionState('disconnected');
        setAgentState(null);
      });
      room.on(RoomEvent.ParticipantConnected, updateAgentState);
      room.on(RoomEvent.ParticipantAttributesChanged, (_changed, participant) =>
        updateAgentState(participant),
      );
      room.on(RoomEvent.TrackSubscribed, (track) => attachRemoteAudio(track));
      room.on(RoomEvent.TrackUnsubscribed, (track) => detachRemoteAudio(track));
      room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
        if (topic !== guideSourcesTopic) return;
        const message = parseGuideSourcesMessage(decoder.decode(payload));
        if (message) pendingSourcesRef.current = message.sources;
      });
      room.registerTextStreamHandler(transcriptionTopic, (reader, participant) => {
        const segmentId = reader.info.attributes?.['lk.transcription_segment_id'] ?? reader.info.id;
        const role =
          participant.identity === room.localParticipant.identity
            ? ('user' as const)
            : ('agent' as const);
        void (async () => {
          let text = '';
          try {
            for await (const chunk of reader) {
              text += chunk;
              upsertTranscript(segmentId, role, text, false);
            }
            upsertTranscript(segmentId, role, text, true);
          } catch {
            // A dropped partial transcript must not break the audio session.
          }
        })();
      });

      try {
        await room.connect(result.credentials.serverUrl, result.credentials.token, {
          autoSubscribe: true,
        });
        for (const participant of room.remoteParticipants.values()) updateAgentState(participant);
        setConnectionState('connected');
        setReadiness({ status: 'ready', message: '语音导游已连接。', issues: [] });
        return true;
      } catch (error) {
        await disconnectRoom();
        const message = error instanceof Error ? error.message : '无法连接 LiveKit Room';
        setConnectionState('error');
        setErrorMessage(message);
        setReadiness({ status: 'error', message: '语音房间连接失败。', issues: [message] });
        return false;
      }
    })().finally(() => {
      connectPromiseRef.current = null;
    });

    connectPromiseRef.current = promise;
    return promise;
  }, [attachRemoteAudio, detachRemoteAudio, disconnectRoom, updateAgentState, upsertTranscript]);

  useEffect(() => {
    disposedRef.current = false;
    void connect();
    return () => {
      disposedRef.current = true;
      void disconnectRoom();
    };
  }, [connect, disconnectRoom]);

  const prepareMicrophone = useCallback(
    async (track: LocalAudioTrack) => {
      const connected = await connect();
      const room = roomRef.current;
      if (!connected || !room) throw new Error('语音房间尚未连接');
      await room.startAudio().catch(() => undefined);
      if (publishedTrackRef.current === track) return;
      if (publishedTrackRef.current) {
        await room.localParticipant.unpublishTrack(
          publishedTrackRef.current.mediaStreamTrack,
          false,
        );
      }
      await room.localParticipant.publishTrack(track.mediaStreamTrack, {
        name: 'desktop-microphone',
        source: Track.Source.Microphone,
      });
      publishedTrackRef.current = track;
    },
    [connect],
  );

  const retry = useCallback(async () => {
    await disconnectRoom();
    return connect();
  }, [connect, disconnectRoom]);

  return {
    agentState,
    connectionState,
    errorMessage,
    messages,
    prepareMicrophone,
    readiness,
    retry,
  };
};
