import { describe, expect, it } from 'vitest';
import {
  applyLocalLiveKitEnvironment,
  createLocalLiveKitConfig,
  createLocalLiveKitConnection,
  getLocalLiveKitServerPath,
  shouldAutoStartLocalLiveKit,
  type LocalLiveKitRuntimeState,
} from '../../desktop/main/local-livekit-runtime.js';

const state: LocalLiveKitRuntimeState = {
  apiKey: 'msfs_local_key_123',
  apiSecret: 'local_secret_which_is_long_enough_123456',
  signalPort: 37_001,
  rtcTcpPort: 37_002,
  rtcUdpPort: 37_003,
};

describe('local LiveKit runtime', () => {
  it('auto-starts by default and requires an explicit false value to stay external', () => {
    expect(shouldAutoStartLocalLiveKit({})).toBe(true);
    expect(shouldAutoStartLocalLiveKit({ MSFS_AUTO_START_LIVEKIT: 'true' })).toBe(true);
    expect(shouldAutoStartLocalLiveKit({ MSFS_AUTO_START_LIVEKIT: 'false' })).toBe(false);
    expect(shouldAutoStartLocalLiveKit({ MSFS_AUTO_START_LIVEKIT: '  OFF  ' })).toBe(false);
  });

  it('creates a loopback-only LiveKit Server config with dedicated runtime credentials', () => {
    expect(createLocalLiveKitConfig(state)).toBe(`port: 37001
rtc:
  udp_port: 37003
  tcp_port: 37002
  use_external_ip: false
  node_ip: 127.0.0.1
keys:
  msfs_local_key_123: local_secret_which_is_long_enough_123456
logging:
  level: warn
`);
  });

  it('uses the app-private server location in packaged builds and the local resource in development', () => {
    expect(
      getLocalLiveKitServerPath({
        isPackaged: true,
        resourcesPath: 'C:\\Program Files\\MSFS Guide\\resources',
        projectRoot: 'D:\\code\\guide',
      }),
    ).toBe('C:\\Program Files\\MSFS Guide\\resources\\livekit\\livekit-server.exe');
    expect(
      getLocalLiveKitServerPath({
        isPackaged: false,
        resourcesPath: 'C:\\Program Files\\MSFS Guide\\resources',
        projectRoot: 'D:\\code\\guide',
      }),
    ).toBe('D:\\code\\guide\\resources\\livekit\\livekit-server.exe');
  });

  it('overrides only the LiveKit connection values before starting the local Agent Worker', () => {
    const connection = createLocalLiveKitConnection(state);
    const environment = applyLocalLiveKitEnvironment(
      { DEEPSEEK_API_KEY: 'provider-key', LIVEKIT_AGENT_NAME: 'msfs-voice-guide' },
      connection,
    );

    expect(connection).toEqual({
      url: 'ws://127.0.0.1:37001',
      apiKey: state.apiKey,
      apiSecret: state.apiSecret,
    });
    expect(environment).toMatchObject({
      DEEPSEEK_API_KEY: 'provider-key',
      LIVEKIT_AGENT_NAME: 'msfs-voice-guide',
      LIVEKIT_URL: connection.url,
      LIVEKIT_API_KEY: state.apiKey,
      LIVEKIT_API_SECRET: state.apiSecret,
    });
  });
});
