import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
await build({ entryPoints: ['src/amap.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'dist/amap-smoke.mjs' });
const { AmapClient } = await import('../dist/amap-smoke.mjs');
const env = await readFile('.env.local', 'utf8');
const key = env.split(/\r?\n/).find(line => line.trim().startsWith('AMAP_KEY='))?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
if (!key) throw new Error('请先在 .env.local 填写 AMAP_KEY');
const client = new AmapClient(key, async url => {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('HTTP failure');
  return response.json();
});
try {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const place = await client.place({ latitude: 31.2304, longitude: 121.4737 });
  const weather = await client.weather(place.adcode, date);
  console.log(JSON.stringify({ ...place.fields, ...weather }, null, 2));
} catch {
  console.error('真实接口验证失败；未输出请求地址或 Key。');
  process.exitCode = 1;
}
