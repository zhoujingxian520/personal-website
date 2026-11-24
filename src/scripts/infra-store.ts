export const STORAGE_KEY = 'zhoujingxian.ai-infra.v1';
export type Note = { projectId: string; contentVersion: string; text: string; updatedAt: string };
export type Experiment = { contentVersion: string; prediction: string; environment: string; observation: string; conclusion: string; updatedAt: string; correctness?: string; elapsed?: string; memory?: string };
export type Mastery = { contentVersion: string; learned: boolean; updatedAt: string };
export type InfraData = { schemaVersion: 1; notes: Record<string, Note>; experiments: Record<string, Experiment>; mastery: Record<string, Mastery> };
export type Manifest = { notes: Record<string, string>; experiments: Record<string, string>; mastery: Record<string, string> };
const groups = ['notes', 'experiments', 'mastery'] as const;
export const emptyData = (): InfraData => ({ schemaVersion: 1, notes: {}, experiments: {}, mastery: {} });
const isObject = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value);

export function parseBackup(text: string): InfraData {
  const value = JSON.parse(text);
  if (!isObject(value) || value.schemaVersion !== 1) throw new Error('不支持这个备份版本，原数据未修改。');
  for (const group of groups) {
    if (!isObject(value[group])) throw new Error(`备份缺少有效的 ${group} 数据。`);
    for (const [id, record] of Object.entries(value[group])) {
      if (!/^infra-(?:block|fragment|project|unit)-[a-z0-9-]+$/.test(id) || !isObject(record)) throw new Error('备份记录 ID 或格式无效。');
      const fields = group === 'notes' ? ['projectId', 'contentVersion', 'text', 'updatedAt']
        : group === 'experiments' ? ['contentVersion', 'prediction', 'environment', 'observation', 'conclusion', 'updatedAt']
        : ['contentVersion', 'updatedAt'];
      if (fields.some(field => typeof record[field] !== 'string') || (group === 'mastery' && typeof record.learned !== 'boolean')) throw new Error(`备份记录 ${id} 字段格式无效。`);
      if (group === 'experiments' && ['correctness', 'elapsed', 'memory'].some(field => record[field] !== undefined && typeof record[field] !== 'string')) throw new Error(`实验记录 ${id} 指标格式无效。`);
    }
  }
  // Ignore extra top-level fields; personal text is never interpreted as HTML.
  return { schemaVersion: 1, notes: value.notes, experiments: value.experiments, mastery: value.mastery };
}

export function previewImport(local: InfraData, incoming: InfraData, manifest: Manifest) {
  const result = { added: 0, conflicts: 0, missing: 0, outdated: 0 };
  for (const group of groups) for (const [id, record] of Object.entries(incoming[group])) {
    if (Object.hasOwn(local[group], id)) result.conflicts++; else result.added++;
    if (!Object.hasOwn(manifest[group], id)) result.missing++;
    else if (manifest[group][id] !== record.contentVersion) result.outdated++;
  }
  return result;
}

export function mergeBackup(local: InfraData, incoming: InfraData, overwrite = false): InfraData {
  return {
    schemaVersion: 1,
    notes: overwrite ? { ...local.notes, ...incoming.notes } : { ...incoming.notes, ...local.notes },
    experiments: overwrite ? { ...local.experiments, ...incoming.experiments } : { ...incoming.experiments, ...local.experiments },
    mastery: overwrite ? { ...local.mastery, ...incoming.mastery } : { ...incoming.mastery, ...local.mastery },
  };
}

export class InfraStore {
  data = emptyData();
  persistent = true;
  issue = '';
  private storage: Pick<Storage, 'getItem' | 'setItem'> | undefined;
  constructor(getStorage: () => Pick<Storage, 'getItem' | 'setItem'> = () => window.localStorage) {
    try {
      this.storage = getStorage();
      const raw = this.storage.getItem(STORAGE_KEY);
      if (raw !== null) this.data = parseBackup(raw);
    } catch {
      this.persistent = false;
      this.issue = '无法读取本地数据；原存储未改动。当前仅使用会话记录，请导出备份。';
    }
  }
  latest() {
    if (this.persistent) {
      try {
        const raw = this.storage!.getItem(STORAGE_KEY);
        this.data = raw === null ? emptyData() : parseBackup(raw);
      } catch {
        this.persistent = false;
        this.issue = '无法读取最新本地记录；原存储未改动，当前使用会话记录，请导出备份。';
      }
    }
    return this.data;
  }
  save(next: InfraData, importing = false) {
    if (this.persistent) {
      try { this.storage!.setItem(STORAGE_KEY, JSON.stringify(next)); }
      catch {
        this.persistent = false;
        this.issue = '本地保存失败，原存储未改动；当前仅使用会话记录，请导出备份。';
        if (importing) throw new Error('导入未写入，原记录保留。可导出当前记录后重试。');
      }
    }
    this.data = next;
    return this.persistent;
  }
  backup() { return JSON.stringify({ ...this.data, exportedAt: new Date().toISOString() }, null, 2); }
}
