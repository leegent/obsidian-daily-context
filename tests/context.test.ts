import test from 'node:test';
import assert from 'node:assert/strict';
import { AmapClient } from '../src/amap';
import { coordinates, weatherSummary, mergeContext } from '../src/context';
import DailyContext from '../src/main';
import { Notice, moment, setHandler } from './obsidian-mock';

const date = moment().format('YYYY-MM-DD');
function response(url: string): unknown {
  const u = new URL(url);
  if (u.pathname.endsWith('/convert')) {
    assert.equal(u.searchParams.get('locations'), '121.4737,31.2304');
    return { status: '1', locations: '121.4782,31.2284' };
  }
  if (u.pathname.endsWith('/regeo')) {
    assert.equal(u.searchParams.get('location'), '121.4782,31.2284');
    return { status: '1', regeocode: { formatted_address: '上海市黄浦区音乐厅', addressComponent: { province: '上海市', city: [], district: '黄浦区', adcode: '310101' } } };
  }
  assert.equal(u.searchParams.get('city'), '310101');
  assert.equal(u.searchParams.get('extensions'), 'all');
  return { status: '1', forecasts: [{ casts: [
    { date: '1999-01-01', dayweather: '雪', nightweather: '雪', daytemp: '-9', nighttemp: '-12' },
    { date, dayweather: '多云', nightweather: '小雨', daytemp: '29', nighttemp: '22' },
  ] }] };
}
function fixture(initial: Record<string, unknown> = { location: [31.2304, 121.4737] }) {
  const plugin = new DailyContext();
  const file = { path: `Daily/${date}.md`, extension: 'md', get basename() { return this.path.split('/').pop()!.slice(0, -3); } };
  const state = { fm: structuredClone(initial), writes: 0, active: file, requests: 0 };
  const events: Record<string, Function> = {};
  plugin.app = {
    vault: { read: async () => JSON.stringify(state.fm), getAbstractFileByPath: (path: string) => path === file.path ? file : null },
    fileManager: { processFrontMatter: async (_: unknown, callback: Function) => {
      const next = structuredClone(state.fm); callback(next); state.fm = next; state.writes++;
    } },
    workspace: { getActiveFile: () => state.active, on: (name: string, fn: Function) => { events[name] = fn; }, onLayoutReady: (fn: Function) => fn() },
    metadataCache: { getFileCache: () => ({}), on: (name: string, fn: Function) => { events[name] = fn; } },
  };
  plugin.settings.amapKey = 'test-secret';
  Notice.messages = [];
  setHandler(async url => { state.requests++; return response(url); });
  return { plugin, file, state, events };
}

test('coordinate order, invalid coordinates and zero are handled', () => {
  assert.deepEqual(coordinates('0, 0'), { latitude: 0, longitude: 0 });
  for (const value of [[91, 1], [1, 181], ['', 10], [false, 10], 'bad']) assert.throws(() => coordinates(value));
});
test('weather includes negative/zero temperatures and preserves same condition', () => {
  assert.deepEqual(weatherSummary({ dayweather: '晴', nightweather: '晴', daytemp: '0', nighttemp: '-3' }), { weather: '晴 -3～0℃' });
  assert.throws(() => weatherSummary({ dayweather: '晴', nightweather: '晴', daytemp: '', nighttemp: '2' }));
});
test('existing fields and handwritten weather survive', () => {
  const fm: any = { weather: '我看到的晴天', tags: ['日记'], temperature: 0 };
  mergeContext(fm, { weather: '雨 1～2℃', address: '上海' });
  assert.deepEqual(fm, { weather: '我看到的晴天', tags: ['日记'], temperature: 0, address: '上海' });
});
test('full chain uses converted coordinates, handles municipality and selects exact date', async () => {
  const { plugin, file, state } = fixture();
  await plugin.fill(file as any, false);
  assert.equal(state.requests, 3); assert.equal(state.writes, 1);
  assert.equal(state.fm.place, undefined); assert.equal(state.fm.address, '上海市·音乐厅');
  assert.equal(state.fm.weather, '多云转小雨 22～29℃');
  assert.deepEqual(Object.keys(state.fm).sort(), ['address', 'location', 'weather']);
  assert.deepEqual(state.fm.location, [31.2304, 121.4737]);
});
test('old notes are rejected before any network or write', async () => {
  const { plugin, file, state } = fixture(); file.path = 'Daily/1999-01-01.md';
  await plugin.fill(file as any, false);
  assert.equal(state.requests, 0); assert.equal(state.writes, 0);
});
test('weather failure still saves place and shows error without secret', async () => {
  const { plugin, file, state } = fixture();
  setHandler(async url => { if (url.includes('weatherInfo')) throw new Error(url); return response(url); });
  await plugin.fill(file as any, false);
  assert.equal(state.fm.address, '上海市·音乐厅'); assert.equal(state.fm.weather, undefined);
  assert.ok(!Notice.messages.join('').includes('test-secret'));
});
test('concurrent coordinate edits discard stale result', async () => {
  const { plugin, file, state } = fixture();
  setHandler(async url => { const result = response(url); if (url.includes('weatherInfo')) state.fm.location = [20, 110]; return result; });
  await plugin.fill(file as any, false);
  assert.equal(state.writes, 0); assert.deepEqual(state.fm.location, [20, 110]);
});
test('switching active file never redirects a pending write', async () => {
  const { plugin, file, state } = fixture();
  setHandler(async url => { state.active = { path: 'Other.md', extension: 'md', basename: 'Other' }; return response(url); });
  await plugin.fill(file as any, false);
  assert.equal(state.writes, 1); assert.equal(state.fm.weather, '多云转小雨 22～29℃');
});
test('complete notes make no requests or writes', async () => {
  const { plugin, file, state } = fixture({ location: [31, 121], address: '上海市·家', weather: '晴 20℃' });
  await plugin.fill(file as any, false);
  assert.equal(state.requests, 0); assert.equal(state.writes, 0);
});
test('duplicate commands share the active operation', async () => {
  const { plugin, file, state } = fixture();
  await Promise.all([plugin.fill(file as any, false), plugin.fill(file as any, false)]);
  assert.equal(state.requests, 3); assert.equal(state.writes, 1);
});
test('permission rejection never writes or calls high-level APIs', async () => {
  const { plugin, file, state } = fixture({});
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { geolocation: { getCurrentPosition: (_: unknown, reject: Function) => reject({ code: 1 }) } } });
  await plugin.fill(file as any, false);
  assert.equal(state.requests, 0); assert.equal(state.writes, 0);
  assert.ok(Notice.messages.some(m => m.includes('权限被拒绝')));
});
test('fresh GPS result keeps WGS84 in note', async () => {
  const { plugin, file, state } = fixture({});
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { geolocation: { getCurrentPosition: (success: Function) => success({ coords: { latitude: 31.2304, longitude: 121.4737 } }) } } });
  await plugin.fill(file as any, false);
  assert.equal(state.fm.location, '31.2304,121.4737'); assert.equal(state.fm.location_crs, undefined);
});
test('automatic events cannot create a request loop', async () => {
  const { plugin, file, state, events } = fixture();
  (plugin as any).saved = { amapKey: 'test-secret', autoFill: true };
  await plugin.onload();
  events.changed(file); events['file-open'](file);
  await new Promise(resolve => setTimeout(resolve, 10));
  events.changed(file);
  assert.equal(state.requests, 3); assert.equal(state.writes, 1);
});
test('unload during request prevents writing', async () => {
  const { plugin, file, state } = fixture();
  setHandler(async url => { plugin.onunload(); return response(url); });
  await plugin.fill(file as any, false); assert.equal(state.writes, 0);
});
test('API failure reports only safe code, never key-containing info', async () => {
  const client = new AmapClient('secret', async () => ({ status: '0', infocode: '10001', info: 'secret' }));
  await assert.rejects(client.place({ latitude: 1, longitude: 2 }), e => e instanceof Error && e.message.includes('10001') && !e.message.includes('secret'));
});
test('missing target date never uses another forecast', async () => {
  const client = new AmapClient('secret', async () => response('https://restapi.amap.com/v3/weather/weatherInfo?city=310101&extensions=all'));
  await assert.rejects(client.weather('310101', '1900-01-01'), /目标日期/);
});


test('existing address is preserved on upgrade', async () => {
  const { plugin, file, state } = fixture({ location: [31.2304, 121.4737], place: '手填地点', address: '手填地址' });
  await plugin.fill(file as any, false);
  assert.equal(state.fm.address, '手填地址'); assert.equal(state.fm.place, '手填地点');
});

import { compactPlace } from '../src/place';
test('municipality uses city only and selects exact named suffix rather than nearest POI', () => {
  assert.equal(compactPlace({
    formatted_address: '上海市黄浦区南京东路街道延安高架路凯迪拉克·上海音乐厅',
    addressComponent: { province: '上海市', city: [], district: '黄浦区', township: '南京东路街道' },
    pois: [{ name: '附近便利店', distance: '1' }, { name: '凯迪拉克·上海音乐厅', distance: '178' }],
  }).label, '上海市·凯迪拉克·上海音乐厅');
});
test('normal city excludes province and district', () => {
  assert.equal(compactPlace({
    formatted_address: '浙江省宁波市海曙区鼓楼街道中山东路149号某酒店',
    addressComponent: { province: '浙江省', city: '宁波市', district: '海曙区', township: '鼓楼街道', streetNumber: { street: '中山东路', number: '149号' } },
  }).label, '宁波市·某酒店');
});
test('road and number remain when no named venue is known; nearby POI is not substituted', () => {
  assert.equal(compactPlace({
    formatted_address: '浙江省宁波市海曙区中山东路149号',
    addressComponent: { province: '浙江省', city: '宁波市', district: '海曙区', streetNumber: { street: '中山东路', number: '149号' } },
    pois: [{ name: '不相关店铺', distance: '1' }],
  }).label, '宁波市·中山东路149号');
});
test('empty address components do not become array strings or repeat city', () => {
  assert.equal(compactPlace({ formatted_address: '上海市', addressComponent: { province: '上海市', city: [], district: [], building: [], streetNumber: [] } }).label, '上海市');
});


test('existing weather does not trigger a temperature-only weather request', async () => {
  const { plugin, file, state } = fixture({ location: [31.2304, 121.4737], weather: '手填天气' });
  await plugin.fill(file as any, false);
  assert.equal(state.requests, 0);
  assert.equal(state.writes, 0);
  assert.equal(state.fm.weather, '手填天气');
});
test('legacy explicit non-WGS84 coordinates are still rejected before requests', async () => {
  const { plugin, file, state } = fixture({ location: [31.2304, 121.4737], location_crs: 'GCJ02' });
  await plugin.fill(file as any, false);
  assert.equal(state.requests, 0); assert.equal(state.writes, 0);
});


test('today title is eligible in any directory', async () => {
  const { plugin, file, state } = fixture(); file.path = `日记/工作/${date}.md`;
  await plugin.fill(file as any, false);
  assert.equal(state.requests, 3); assert.equal(state.writes, 1);
});
test('automatic fill skips weather-only notes without locating', async () => {
  const { plugin, file, state } = fixture({ weather: '晴 20℃' });
  (plugin as any).saved = { amapKey: 'test-secret', autoFill: true };
  await plugin.onload();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(state.requests, 0); assert.equal(state.writes, 0);
});
test('automatic fill ignores a non-active file event', async () => {
  const { plugin, state, events } = fixture();
  (plugin as any).saved = { amapKey: 'test-secret', autoFill: false };
  await plugin.onload(); plugin.settings.autoFill = true;
  events['file-open']({ path: `Other/${date}.md`, basename: date, extension: 'md' });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(state.requests, 0); assert.equal(state.writes, 0);
});
test('weather added during query prevents adding location or address', async () => {
  const { plugin, file, state } = fixture();
  setHandler(async url => { state.fm.weather = '手填天气'; return response(url); });
  await plugin.fill(file as any, false);
  assert.equal(state.fm.weather, '手填天气'); assert.equal(state.fm.address, undefined);
});


test('date prefix accepts custom titles without scanning folders', async () => {
  for (const suffix of [' 今天去了上海', '-随手记', '_旅行', '｜日记', '旅行日记']) {
    const { plugin, file, state } = fixture(); file.path = `旅行/${date}${suffix}.md`;
    await plugin.fill(file as any, false);
    assert.equal(state.requests, 3, suffix); assert.equal(state.writes, 1, suffix);
  }
});
test('old date with title, embedded date and extra digit are not today prefixes', async () => {
  for (const title of ['1999-01-01 随手记', `旅行 ${date}`, `${date}0 随手记`]) {
    const { plugin, file, state } = fixture(); file.path = `${title}.md`;
    await plugin.fill(file as any, false);
    assert.equal(state.requests, 0, title); assert.equal(state.writes, 0, title);
  }
});
test('configured date format supports a custom title suffix', async () => {
  const { plugin, file, state } = fixture(); plugin.settings.dateFormat = 'YYYY年MM月DD日';
  file.path = `${moment().format('YYYY年MM月DD日')} 旅行.md`;
  await plugin.fill(file as any, false); assert.equal(state.writes, 1);
});


test('rapid settings edits apply immediately and persist in order without querying', async () => {
  const { plugin, state } = fixture();
  const persisted: any[] = [];
  plugin.saveData = async (value: unknown) => {
    await new Promise(resolve => setTimeout(resolve, persisted.length === 0 ? 10 : 0));
    persisted.push(value);
  };
  const first = plugin.saveSettings({ amapKey: 'first', dateFormat: 'YYYY-MM-DD', autoFill: false });
  const last = plugin.saveSettings({ ...plugin.settings, amapKey: 'last', autoFill: true });
  assert.equal(plugin.settings.amapKey, 'last');
  assert.equal(plugin.settings.autoFill, true);
  await Promise.all([first, last]);
  assert.equal(persisted[1].amapKey, 'last');
  assert.equal(state.requests, 0);
});
