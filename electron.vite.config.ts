import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['electron'],
        input: 'desktop/main/index.ts',
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
    build: {
      rollupOptions: {
        input: 'index.html',
      },
    },
    plugins: [react()],
  },
});
