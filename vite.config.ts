import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  // Keep every cache inside the project: the sandbox blocks writes to the
  // system temp directory, which silently drops transform results.
  cacheDir: 'node_modules/.vite',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    reporters: 'default',
    // A single forked process keeps runs deterministic and avoids the worker
    // pool racing on the Vite transform cache.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
