import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true, port: 5173 },
  build: { target: ['es2020', 'chrome80', 'safari14', 'firefox80'], cssTarget: ['chrome80', 'safari14', 'firefox80'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as any);
