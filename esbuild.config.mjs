import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian'],
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  outfile: 'main.js',
});
await mkdir('dist/daily-context', { recursive: true });
for (const name of ['main.js', 'manifest.json']) {
  await copyFile(name, `dist/daily-context/${name}`);
}
