const parentPort = process.parentPort;

try {
  await Promise.all([
    import('@livekit/agents'),
    import('@livekit/agents-plugin-openai'),
    import('@livekit/protocol'),
    import('@livekit/rtc-node'),
    import('livekit-server-sdk'),
    import('ws'),
    import('zod'),
  ]);
  parentPort.postMessage({ type: 'runtime-smoke-ready' });
  process.exit(0);
} catch (error) {
  parentPort.postMessage({
    type: 'runtime-smoke-error',
    message: error instanceof Error ? (error.stack ?? error.message) : String(error),
  });
  process.exit(1);
}
