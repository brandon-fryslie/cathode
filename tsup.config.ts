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
    clean: true,
    platform: 'node',
    target: 'node18',
    external: ['ws'],
  },
  // Renderer (Browser) — ESM only
  {
    entry: {
      'renderer/index': 'src/renderer/index.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    platform: 'browser',
    target: 'es2022',
    // No external — bundle everything for the browser
  },
])
