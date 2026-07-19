import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol';
import { AccessToken } from 'livekit-server-sdk';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../../src/config/schema.js';
import type { DesktopSessionCredentials } from '../../shared/desktop-contracts.js';

const tokenTtlSeconds = 15 * 60;

const compactId = () => randomUUID().replaceAll('-', '');

export async function createDesktopSessionCredentials(
  config: AppConfig,
): Promise<DesktopSessionCredentials> {
  const sessionId = compactId();
  const roomName = `msfs-guide-${sessionId}`;
  const participantIdentity = `desktop-user-${sessionId}`;
  const accessToken = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    identity: participantIdentity,
    name: '模拟飞行用户',
    ttl: tokenTtlSeconds,
  });

  accessToken.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  accessToken.roomConfig = new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName: config.livekit.agentName })],
  });

  return {
    serverUrl: config.livekit.url,
    token: await accessToken.toJwt(),
    roomName,
    participantIdentity,
  };
}
