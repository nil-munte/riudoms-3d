import { defineConfig } from 'vite';
import { demoRecorder } from './tools/demo/vite-plugin';

// base './' so `npm run build` produces a static site that works from any folder
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  server: { port: 5173, open: false, watch: { ignored: ['**/demo-out/**', '**/data/**'] } },
  plugins: [demoRecorder()],
});
