import { STORAGE_KEY, type NotebookData } from './types.ts';
import { createEmptyNotebookData, parseNotebookJson, validateNotebookData } from './schema.ts';

export { STORAGE_KEY } from './types.ts';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export class NotebookStore {
  data: NotebookData;
  persistent = true;
  issue = '';
  private storage: StorageLike | undefined;

  constructor(
    getStorage: () => StorageLike = () => window.localStorage,
    nowIso?: string,
  ) {
    this.data = createEmptyNotebookData(nowIso);
    try {
      this.storage = getStorage();
      const raw = this.storage.getItem(STORAGE_KEY);
      if (raw !== null) {
        this.data = parseNotebookJson(raw);
      }
    } catch {
      this.persistent = false;
      this.issue = '无法读取本地记事本数据；原存储未改动。当前仅使用会话记录，请导出备份。';
    }
  }

  latest(): NotebookData {
    if (!this.persistent || !this.storage) {
      return this.data;
    }
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (raw !== null) {
        this.data = parseNotebookJson(raw);
      }
    } catch {
      this.persistent = false;
      this.issue = '无法读取最新本地记事本记录；原存储未改动，当前使用会话记录，请导出备份。';
    }
    return this.data;
  }

  save(next: NotebookData, strict = false): boolean {
    const validated = validateNotebookData(next);
    if (!this.persistent || !this.storage) {
      if (strict) {
        throw new Error(this.issue || '本地存储不可用，无法保存。');
      }
      this.data = validated;
      return false;
    }

    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(validated));
      this.data = validated;
      this.issue = '';
      return true;
    } catch (error) {
      if (strict) {
        throw error instanceof Error ? error : new Error('本地存储写入失败。');
      }
      this.data = validated;
      this.persistent = false;
      this.issue = '本地保存失败，原存储未改动；当前仅使用会话记录，请导出备份。';
      return false;
    }
  }

  serialize(): string {
    return JSON.stringify(this.data, null, 2);
  }
}
