import { App, getFrontMatterInfo, moment, Notice, parseYaml, Platform, Plugin, PluginSettingTab, requestUrl, Setting, TFile } from 'obsidian';
import { AmapClient } from './amap';
import { assertWgs84, blank, ContextError, coordinates, Frontmatter, locationSignature, mergeContext } from './context';
import { locate } from './location';

interface Settings { amapKey: string; dateFormat: string; autoFill: boolean }
const defaults: Settings = { amapKey: '', dateFormat: 'YYYY-MM-DD', autoFill: false };
const today = (): string => moment().format('YYYY-MM-DD');

export default class DailyContextPlugin extends Plugin {
  settings: Settings = { ...defaults };
  private readonly running = new Set<TFile>();
  private readonly attempted = new Set<string>();
  private stopped = false;
  private settingsSave: Promise<void> = Promise.resolve();

  async onload(): Promise<void> {
    const saved = await this.loadData();
    if (saved && typeof saved === 'object') {
      for (const key of ['amapKey', 'dateFormat'] as const) {
        if (typeof saved[key] === 'string') this.settings[key] = saved[key];
      }
      this.settings.autoFill = saved.autoFill === true;
    }
    this.addSettingTab(new DailyContextSettings(this.app, this));
    if (!Platform.isMobile) return;
    const recordContext = (): void => {
      const file = this.app.workspace.getActiveFile();
      if (!file) { new Notice('请先打开今日日记。'); return; }
      void this.fill(file, false);
    };
    this.addCommand({ id: 'fill-daily-context', name: '记录地点与天气', icon: 'cloud-sun', callback: recordContext });
    this.addRibbonIcon('cloud-sun', '记录地点与天气', recordContext);
    this.registerEvent(this.app.workspace.on('file-open', file => this.tryAuto(file)));
    this.registerEvent(this.app.metadataCache.on('changed', file => {
      if (file === this.app.workspace.getActiveFile()) this.tryAuto(file);
    }));
    this.app.workspace.onLayoutReady(() => this.tryAuto(this.app.workspace.getActiveFile()));
  }

  onunload(): void { this.stopped = true; }

  dailyTitle(): string {
    // Older settings may include date-based subdirectories; only the title matters.
    return moment().format(this.settings.dateFormat).split('/').pop() || '';
  }

  private isToday(file: TFile): boolean {
    const prefix = this.dailyTitle();
    if (!/Y{2,}/.test(this.settings.dateFormat) || !this.settings.dateFormat.includes('M') || !this.settings.dateFormat.includes('D')) return false;
    if (file.extension !== 'md' || !prefix || !file.basename.startsWith(prefix)) return false;
    // Do not interpret 2026-09-210 as 2026-09-21 followed by a title.
    return !/^\d/.test(file.basename.slice(prefix.length));
  }

  private tryAuto(file: TFile | null): void {
    if (this.stopped || !file || file !== this.app.workspace.getActiveFile() || !this.settings.autoFill || !this.settings.amapKey || !this.isToday(file)) return;
    if (!this.app.metadataCache.getFileCache(file)) return;
    const id = `${today()}:${file.path}`;
    if (this.attempted.has(id) || this.running.has(file)) return;
    this.attempted.add(id);
    void this.fill(file, true);
  }

  async saveSettings(next: Settings): Promise<void> {
    this.settings = { ...next };
    this.attempted.clear();
    const snapshot = { ...next };
    // Serialize writes so fast edits cannot restore an older value on disk.
    const write = this.settingsSave.then(() => this.saveData(snapshot));
    this.settingsSave = write.catch(() => {});
    await write;
  }

  private async readFrontmatter(file: TFile): Promise<Frontmatter> {
    const content = await this.app.vault.read(file);
    const info = getFrontMatterInfo(content);
    if (!info.exists) return {};
    try {
      const parsed: unknown = parseYaml(info.frontmatter);
      if (parsed == null) return {};
      if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      return parsed as Frontmatter;
    } catch { throw new ContextError('笔记的 YAML 属性无法读取，请先修正格式。'); }
  }

  async fill(file: TFile, automatic: boolean): Promise<void> {
    if (this.stopped || !Platform.isMobile) return;
    if (this.running.has(file)) { if (!automatic) new Notice('正在补全，请稍候。'); return; }
    if (!this.isToday(file)) { if (!automatic) new Notice('当前笔记标题不是今天的日期，请检查标题或标题日期格式。'); return; }
    if (!this.settings.amapKey) { if (!automatic) new Notice('请先在 Daily Context 设置中填写高德 Web 服务 Key。'); return; }
    const path = file.path, date = today(), key = this.settings.amapKey;
    this.running.add(file);
    let progress: Notice | undefined;
    try {
      const before = await this.readFrontmatter(file);
      if (automatic && file !== this.app.workspace.getActiveFile()) return;
      if (!blank(before.weather)) { if (!automatic) new Notice('weather 已有内容，已跳过补全。'); return; }
      assertWgs84(before);
      const signature = locationSignature(before);
      if (!automatic) progress = new Notice('正在获取位置和当日天气…', 0);
      const position = coordinates(before.location) ?? await locate();
      const patch: Frontmatter = {
        location: `${position.latitude},${position.longitude}`,
      };
      const client = new AmapClient(key, async url => (await requestUrl({ url, throw: true })).json);
      let warning = '';
      try {
        const place = await client.place(position);
        Object.assign(patch, place.fields);
        if (blank(before.weather)) {
          Object.assign(patch, await client.weather(place.adcode, date));
        }
      } catch (error) {
        warning = error instanceof ContextError ? error.message : '地点或天气查询失败，请重试。';
      }
      if (this.stopped) return;
      if (file.path !== path || today() !== date || !this.isToday(file) || this.app.vault.getAbstractFileByPath(path) !== file) {
        throw new ContextError('日记路径或日期已变化，本次结果未写入。');
      }
      let changes = 0;
      await this.app.fileManager.processFrontMatter(file, fm => {
        if (this.stopped) throw new ContextError('插件已关闭，本次结果未写入。');
        if (!blank(fm.weather)) return;
        if (locationSignature(fm) !== signature) throw new ContextError('查询期间坐标发生变化，本次结果未写入，请重试。');
        changes = mergeContext(fm, patch);
      });
      if (warning) new Notice(`${changes ? '已保存已获取的信息。' : ''}${warning}`, 8000);
      else if (!automatic) new Notice(changes ? '日记地点和天气已补全。' : '已保留现有记录。');
    } catch (error) {
      if (!this.stopped) new Notice(error instanceof ContextError ? error.message : '补全失败，请检查笔记是否可写后重试。', 8000);
    } finally {
      progress?.hide();
      this.running.delete(file);
    }
  }
}

class DailyContextSettings extends PluginSettingTab {
  constructor(app: App, private readonly plugin: DailyContextPlugin) { super(app, plugin); }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    if (!Platform.isMobile) return;
    const update = (patch: Partial<Settings>): void => {
      void this.plugin.saveSettings({ ...this.plugin.settings, ...patch }).catch(() => {
        new Notice('设置保存失败，请检查笔记库是否可写。');
      });
    };
    new Setting(containerEl).setName('高德 Web 服务 Key')
      .setDesc('填写高德控制台的 Web 服务 Key。')
      .addText(input => {
        input.inputEl.type = 'password'; input.inputEl.autocomplete = 'off'; input.inputEl.spellcheck = false;
        input.setPlaceholder('粘贴你的高德 Key').setValue(this.plugin.settings.amapKey)
          .onChange(value => update({ amapKey: value.trim() }));
      });
    new Setting(containerEl).setName('标题日期格式').setDesc('默认 YYYY-MM-DD，日期后可接自定义标题。')
      .addText(input => input.setValue(this.plugin.settings.dateFormat)
        .onChange(value => update({ dateFormat: value.trim() })));
    new Setting(containerEl).setName('自动补全今日日记').setDesc('打开今日日记且 weather 为空时自动补全。')
      .addToggle(toggle => toggle.setValue(this.plugin.settings.autoFill)
        .onChange(value => update({ autoFill: value })));
  }
}
