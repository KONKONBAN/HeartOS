import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' để bản build mở được từ mọi đường dẫn tĩnh (GitHub Pages, hub nội bộ, WebView Android).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true, port: 5173 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as any);
