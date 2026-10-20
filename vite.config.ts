import { defineConfig } from 'vite';

export default defineConfig({
  base: '/portfolio/cram/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
