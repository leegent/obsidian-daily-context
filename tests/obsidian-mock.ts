import realMoment from 'moment';
export const moment = realMoment;
export const Platform = { isMobile: true };
export class Notice {
  static messages: string[] = [];
  constructor(message: string) { Notice.messages.push(message); }
  hide() {}
}
export class Plugin {
  app: any;
  saved: any = {};
  commands: any[] = [];
  ribbons: any[] = [];
  async loadData() { return this.saved; }
  async saveData(value: any) { this.saved = value; }
  addSettingTab() {}
  addCommand(command: any) { this.commands.push(command); }
  addRibbonIcon(icon: string, title: string, callback: Function) { this.ribbons.push({ icon, title, callback }); return {}; }
  registerEvent() {}
}
export class PluginSettingTab {}
export class Setting {}
export class TFile {}
export const getFrontMatterInfo = (content: string) => ({ exists: true, frontmatter: content });
export const parseYaml = JSON.parse;
export let handler: (url: string) => Promise<unknown>;
export function setHandler(fn: typeof handler) { handler = fn; }
export async function requestUrl({ url }: { url: string }) { return { json: await handler(url) }; }
