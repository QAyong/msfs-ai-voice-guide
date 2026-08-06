import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: [
          'electron',
          '@livekit/agents',
          '@livekit/agents-plugin-openai',
          '@livekit/protocol',
          '@livekit/rtc-node',
          'livekit-server-sdk',
          'ws',
          'zod',
        ],
        input: {
          index: resolve('desktop/main/index.ts'),
          'agent-process': resolve('desktop/agent-process.ts'),
          'guide-agent': resolve('src/agent/guide-agent.ts'),
          'runtime-smoke-worker': resolve('desktop/runtime-smoke-worker.ts'),
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        external: ['electron'],
        input: 'desktop/preload/index.ts',
        output: {
          entryFileNames: 'index.cjs',
          format: 'cjs',
        },
      },
    },
  },
  renderer: {
    root: 'desktop/renderer',
    server: {
      host: '127.0.0.1',
      port: 3000,
    },
    build: {
      rollupOptions: {
        input: 'index.html',
      },
    },
    plugins: [react()],
  },
});
