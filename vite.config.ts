import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs so the build works from any folder, including a claude.ai artifact.
  base: './',
  build: {
    target: 'es2022',
    // Keep the bundle predictable for artifact publishing: one JS file, one CSS file.
    modulePreload: false,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 1500,
  },
});
