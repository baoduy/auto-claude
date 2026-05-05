import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  bundle: true,
  splitting: false,
  sourcemap: true,
  banner: { js: '#!/usr/bin/env node' },
  loader: { '.json': 'json' },
});
