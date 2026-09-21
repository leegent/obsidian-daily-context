export type Frontmatter = Record<string, unknown>;
export interface Coordinates { latitude: number; longitude: number }
export const blank = (value: unknown): boolean => value == null || value === '' || (Array.isArray(value) && value.length === 0);
export const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
export class ContextError extends Error {}

export function coordinates(value: unknown): Coordinates | null {
  if (blank(value)) return null;
  const parts = typeof value === 'string' ? value.split(',').map(v => v.trim()) : value;
  if (!Array.isArray(parts) || parts.length !== 2 || parts.some(v => !['number', 'string'].includes(typeof v) || String(v).trim() === '')) {
    throw new ContextError('location 格式不正确，请使用 [纬度, 经度]。');
  }
  const [latitude, longitude] = parts.map(Number);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new ContextError('location 经纬度超出有效范围。');
  }
  return { latitude, longitude };
}

export function assertWgs84(fm: Frontmatter): void {
  if (!blank(fm.location_crs) && fm.location_crs !== 'WGS84') {
    throw new ContextError('现有坐标不是 WGS84，请先转换坐标再补全。');
  }
}

export function locationSignature(fm: Frontmatter): string {
  return JSON.stringify([fm.location ?? null, fm.location_crs ?? null]);
}

export function mergeContext(fm: Frontmatter, patch: Frontmatter): number {
  let changed = 0;
  for (const [key, value] of Object.entries(patch)) {
    if (blank(fm[key]) && !blank(value)) { fm[key] = value; changed++; }
  }
  return changed;
}

export function weatherSummary(cast: Record<string, unknown>): { weather: string } {
  const day = text(cast.dayweather), night = text(cast.nightweather);
  const raw = [cast.daytemp, cast.nighttemp];
  if (!day || !night || raw.some(v => blank(v) || !['string', 'number'].includes(typeof v) || String(v).trim() === '')) {
    throw new ContextError('高德返回的当日天气不完整，请稍后重试。');
  }
  const temperatures = raw.map(Number).sort((a, b) => a - b);
  if (!temperatures.every(Number.isFinite)) throw new ContextError('高德返回的温度无效。');
  const condition = day === night ? day : `${day}转${night}`;
  return { weather: `${condition} ${temperatures[0]}～${temperatures[1]}℃` };
}
