/**
 * Build script — compiles client TypeScript entry point to browser-ready JavaScript.
 * Uses esbuild to bundle all imports into a single file.
 */
import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['client/main.ts'],
  bundle: true,
  format: 'esm',
  outfile: 'client/main.js',
  target: 'es2022',
  platform: 'browser',
});

// eslint-disable-next-line no-console
console.log('[build] client JS compiled → client/main.js');
