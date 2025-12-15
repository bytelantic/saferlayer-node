import { defineConfig } from 'tsup';

export default defineConfig([
  // Main library build
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
  },
  // CLI build
  {
    entry: ['src/cli/index.ts', 'src/cli/bin.js'],
    format: ['esm'],
    outDir: 'dist/cli',
    sourcemap: true,
    splitting: false,
    shims: true,
  },
]);
