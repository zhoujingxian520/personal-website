import { parseBackup, type InfraData } from './infra-store.ts';

export type NotebookHandle = {
  name: string;
  getFile(): Promise<{ text(): Promise<string> }>;
  createWritable(): Promise<{ write(text: string): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }>;
  requestPermission?(options: { mode: 'readwrite' }): Promise<string>;
};

export class FileNotebook {
  handle: NotebookHandle | null = null;
  private queue: Promise<void> = Promise.resolve();
  async read(handle: NotebookHandle) { return parseBackup(await (await handle.getFile()).text()); }
  async connect(handle: NotebookHandle) {
    if (handle.requestPermission && await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('未获得文件写入授权，草稿仍保留。');
    this.handle = handle;
  }
  write(data: InfraData) {
    const handle = this.handle;
    if (!handle) return Promise.reject(new Error('请先新建或打开本地笔记文件。'));
    const text = JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2);
    const operation = this.queue.catch(() => {}).then(async () => {
      const writable = await handle.createWritable();
      try { await writable.write(text); await writable.close(); }
      catch (error) { try { await writable.abort?.(); } catch {} throw error; }
    });
    this.queue = operation;
    return operation;
  }
}
