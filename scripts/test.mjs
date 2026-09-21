import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
await build({ entryPoints: ['tests/context.test.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: 'dist/tests.cjs', alias: { obsidian: resolve('tests/obsidian-mock.ts') } });
const result = spawnSync(process.execPath, ['--test', 'dist/tests.cjs'], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
