# Daily Context

为 Obsidian 移动端日记记录当前位置和当天的天气，地址与天气由高德提供。支持 Obsidian 移动端 1.11.0 及以上版本。

Automatically add location and daily weather to your journal in Obsidian Mobile using AMap.

```yaml
location: 31.2304,121.4737
address: 上海市·凯迪拉克·上海音乐厅
weather: 多云 22～29℃
```

## 安装

1. 从 [GitHub Releases](https://github.com/leegent/obsidian-daily-context/releases) 下载 `main.js` 和 `manifest.json`，放入手机笔记库的 `.obsidian/plugins/daily-context/` 文件夹。
2. 确认 `.obsidian/plugins/daily-context/main.js` 和 `manifest.json` 已就位，重启 Obsidian。
3. 在「设置 → 第三方插件」中启用 Daily Context。

## 使用

在「设置 → Daily Context」填写高德 Web 服务 Key。设置修改后自动保存。

打开今天的日记，点击底部快捷操作浮层中的「记录地点与天气」，首次使用时允许定位。也可以运行命令 `Daily Context: 记录地点与天气`，或将命令加入移动端工具栏。

开启「自动补全今日日记」后，插件会在打开日记时自动记录。手动和自动操作都要求标题以今天的日期开头，例如 `2026-09-21 今天去了上海.md`。标题日期格式默认为 `YYYY-MM-DD`，可在设置中修改。

`weather` 有值时跳过整次操作，为空时补充属性。已有 `location` 会沿用，支持逗号分隔的文本和 YAML 列表，坐标顺序为纬度、经度，坐标系为 WGS84。地址显示为「城市·具体地点」，天气包含当日日夜预报和温度范围。

如需重新记录，清空 `location`、`address` 和 `weather` 后再次运行命令。查询失败时会保留已获取的信息，可手动重试。

## 隐私

插件将坐标通过 HTTPS 发送给高德，用于查询地址和天气。Key 以明文保存在笔记库的 `.obsidian/plugins/daily-context/data.json` 中，同步插件配置时可能一并同步。

## 许可证

[MIT](LICENSE)
