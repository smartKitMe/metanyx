import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'node18',
    outDir: 'dist',
    minify: false,
    lib: {
      entry: 'src/index.js',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [
        'sqlite3',
        // Node builtins (ESM names)
        'node:fs', 'node:path', 'node:url', 'node:crypto', 'node:module',
        // Compatibility for CommonJS import paths
        'fs', 'path', 'url', 'crypto', 'module',
      ],
      output: {
        // Ensure CLI shebang present
        banner: '#!/usr/bin/env node',
      },
    },
  },
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});