import { ContextError, Coordinates, coordinates } from './context';

export async function locate(): Promise<Coordinates> {
  if (!navigator.geolocation) throw new ContextError('设备未提供定位能力，请使用 Obsidian 移动端 1.11 或更新版本。');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ContextError('定位超时，请检查系统定位后重试。')), 22000);
    navigator.geolocation.getCurrentPosition(position => {
      clearTimeout(timer);
      try {
        const result = coordinates([position.coords.latitude, position.coords.longitude]);
        if (!result) throw new Error();
        resolve(result);
      } catch { reject(new ContextError('设备返回的坐标无效。')); }
    }, error => {
      clearTimeout(timer);
      const message = error.code === 1 ? '定位权限被拒绝，请在系统设置中允许 Obsidian 使用位置。' :
        error.code === 3 ? '定位超时，请稍后重试。' : '暂时无法获取位置，请检查系统定位后重试。';
      reject(new ContextError(message));
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
  });
}
