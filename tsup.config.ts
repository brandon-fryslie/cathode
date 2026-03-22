import { defineConfig } from 'tsup'

export default defineConfig([
  // Main process (Node.js) — CJS + ESM
  {
    entry: {
      'index': 'src/index.ts',
      'main/index': 'src/main/index.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    platform: 'node',
    target: 'node18',
    external: ['ws'],
  },
  // CLI launcher — CJS only (uses require() hooks and __dirname)
  {
    entry: {
      'cli': 'src/cli.ts',
    },
    format: ['cjs'],
    sourcemap: true,
    platform: 'node',
    target: 'node18',
    external: ['ws'],
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  // Renderer (Browser) — IIFE for inline injection into HTML
  {
    entry: {
      'renderer/index': 'src/renderer/index.ts',
    },
    format: ['iife'],
    globalName: '__bridge_renderer_raw__',
    dts: true,
    sourcemap: true,
    platform: 'browser',
    target: 'es2022',
  },
])
