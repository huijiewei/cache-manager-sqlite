import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  external: ["better-sqlite3", "cache-manager"],
  dts: true,
  minify: true,
  treeshake: true,
  clean: true,
});
