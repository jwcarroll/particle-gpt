// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    sourcemap: true,
    minify: true,
    target: 'esnext',
  },
  server: {
    port: 3000,
    open: true,
  },
  optimizeDeps: {
    exclude: ['@tweakpane/plugin-essentials'],
  },
});
