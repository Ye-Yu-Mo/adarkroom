/**
 * Quick build script — compiles client TypeScript to browser-ready JavaScript.
 * Uses esbuild (already installed as a vitest dependency).
 */
import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['client/bridge.ts', 'client/multiplayer.ts'],
  bundle: true,
  format: 'esm',
  outdir: 'client',
  outExtension: { '.js': '.js' },
  target: 'es2022',
  platform: 'browser',
});

// eslint-disable-next-line no-console
console.log('[build] client JS compiled');
