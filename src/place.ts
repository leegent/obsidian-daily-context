import { ContextError, text } from './context';

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {};
const entries = (value: unknown): ObjectValue[] => Array.isArray(value) ? value.map(object) : [];

/** Prefer an exact named suffix in AMap's address, never an arbitrary nearby POI. */
export function compactPlace(regeocode: ObjectValue): { city: string; address: string; label: string } {
  const component = object(regeocode.addressComponent);
  const province = text(component.province);
  const city = text(component.city) || (/^(北京|上海|天津|重庆)市$/.test(province) ? province : text(component.district));
  const formatted = text(regeocode.formatted_address);
  const names = [
    text(object(component.building).name), text(object(component.neighborhood).name),
    ...entries(regeocode.pois).map(poi => text(poi.name)),
    ...entries(regeocode.aois).map(aoi => text(aoi.name)),
  ].filter(name => !!name && formatted.endsWith(name)).sort((a, b) => b.length - a.length);
  let address = names[0] || '';
  if (!address) {
    address = formatted;
    for (const part of [component.country, component.province, component.city, component.district, component.township]) {
      const prefix = text(part);
      if (prefix && address.startsWith(prefix)) address = address.slice(prefix.length);
    }
    const street = object(component.streetNumber);
    const roads = [text(street.street), ...entries(regeocode.roads).map(road => text(road.name))]
      .filter(Boolean).sort((a, b) => b.length - a.length);
    for (const road of roads) {
      if (!address.startsWith(road)) continue;
      let suffix = address.slice(road.length);
      const number = text(street.number);
      if (number && suffix.startsWith(number)) suffix = suffix.slice(number.length);
      // A road or street-number address is itself useful if no named place follows.
      if (suffix && !/^\d+[号弄栋室]?$/u.test(suffix)) address = suffix;
      break;
    }
  }
  if (!city && !address) throw new ContextError('高德未能识别这个位置的地址。');
  return { city, address, label: [city, address === city ? '' : address].filter(Boolean).join('·') };
}
