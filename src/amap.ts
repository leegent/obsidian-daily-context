import { compactPlace } from './place';
import { ContextError, Coordinates, Frontmatter, text, weatherSummary } from './context';

type JsonObject = Record<string, unknown>;
export type Transport = (url: string) => Promise<unknown>;
const object = (value: unknown): JsonObject => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};

export class AmapClient {
  constructor(private readonly key: string, private readonly transport: Transport) {}

  private async call(path: string, params: Record<string, string>): Promise<JsonObject> {
    const query = new URLSearchParams({ ...params, key: this.key, output: 'JSON' });
    let result: unknown;
    let timer: number | undefined;
    try {
      result = await Promise.race([
        this.transport(`https://restapi.amap.com/v3/${path}?${query}`),
        new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error()), 20000); }),
      ]);
    } catch {
      // Transport exceptions can contain the URL and secret; never display them.
      throw new ContextError('无法连接高德，请检查网络后重试。');
    } finally { if (timer !== undefined) window.clearTimeout(timer); }
    const data = object(result);
    if (data.status !== '1') {
      const code = /^\d{5}$/.test(String(data.infocode)) ? String(data.infocode) : '未知';
      const hint = code === '10001' ? 'Key 无效，请检查 Web 服务 Key。' :
        ['10003', '10004', '10044'].includes(code) ? '调用额度或频率受限，请稍后重试。' :
        '请检查 Key 类型、接口权限和配额。';
      throw new ContextError(`高德请求失败（${code}）：${hint}`);
    }
    return data;
  }

  async place(position: Coordinates): Promise<{ fields: Frontmatter; adcode: string }> {
    const converted = await this.call('assistant/coordinate/convert', {
      locations: `${position.longitude},${position.latitude}`, coordsys: 'gps',
    });
    const location = text(converted.locations);
    if (!/^[-\d.]+,[-\d.]+$/.test(location)) throw new ContextError('高德未返回有效的转换坐标。');
    const response = await this.call('geocode/regeo', { location, extensions: 'all' });
    const regeo = object(response.regeocode), component = object(regeo.addressComponent);
    return { fields: { address: compactPlace(regeo).label }, adcode: text(component.adcode) };
  }

  async weather(adcode: string, date: string): Promise<Frontmatter> {
    if (!/^\d{6}$/.test(adcode)) throw new ContextError('该位置没有可用的天气行政区代码。');
    const result = await this.call('weather/weatherInfo', { city: adcode, extensions: 'all' });
    const forecasts: unknown[] = Array.isArray(result.forecasts) ? result.forecasts : [];
    for (const item of forecasts) {
      const forecast = object(item);
      const casts: unknown[] = Array.isArray(forecast.casts) ? forecast.casts : [];
      const cast = casts.find((item: unknown) => object(item).date === date);
      if (cast) return weatherSummary(object(cast));
    }
    throw new ContextError('高德没有返回目标日期的天气，已保留地点信息。');
  }
}
