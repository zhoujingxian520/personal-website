import { InfraStore, STORAGE_KEY, parseBackup, previewImport, mergeBackup, type InfraData, type Note, type Experiment, type Manifest } from './infra-store';
import { FileNotebook, type NotebookHandle } from './infra-file';
import { bindProgress } from './infra-progress';
import { bindReview } from './infra-review';

// The old key is read for migration only; new browser data is a recovery draft.
const DRAFT_KEY = 'zhoujingxian.ai-infra.draft.v1';
const store = new InfraStore(() => ({
  getItem: () => localStorage.getItem(DRAFT_KEY) ?? localStorage.getItem(STORAGE_KEY),
  setItem: (_, value) => localStorage.setItem(DRAFT_KEY, value),
}));
const notebook = new FileNotebook();
const forms = [...document.querySelectorAll<HTMLFormElement>('[data-personal-form]')];
const backup = document.querySelector<HTMLElement>('[data-personal-data]')!;
const manifest: Manifest = JSON.parse(backup.dataset.manifest!);
const dirty = new Set<HTMLFormElement>();
const announce = backup.querySelector<HTMLElement>('[data-backup-status]')!;
const storageStatus = backup.querySelector<HTMLElement>('[data-storage-status]')!;
const fileStatus = backup.querySelector<HTMLElement>('[data-notebook-status]')!;
const preview = backup.querySelector<HTMLElement>('[data-import-preview]')!;
const overwrite = backup.querySelector<HTMLInputElement>('[data-import-overwrite]')!;
const picker = window as unknown as {
  showOpenFilePicker?: (options: object) => Promise<NotebookHandle[]>;
  showSaveFilePicker?: (options: object) => Promise<NotebookHandle>;
};
let pending: InfraData | null = null;
let pendingHandle: NotebookHandle | null = null;
let pendingFilename = '';
let revision = 0;
let timer: ReturnType<typeof setTimeout>;
let writing = 0;
let progressDirty = false;

function showStorage() {
  storageStatus.textContent = store.issue || (location.protocol === 'file:' ? '离线文件模式：跨页草稿可能不共享，建议用本机 HTTP 记录。' : '') + '浏览器仅保留恢复草稿，正式记录以选定的电脑文件为准；旧浏览器记录未删除。';
}
function field(form: HTMLFormElement, name: string) { return form.elements.namedItem(name) as HTMLTextAreaElement; }
function recordStatus(form: HTMLFormElement, message: string) { form.querySelector<HTMLElement>('[data-record-status]')!.textContent = message; }
function fillForm(form: HTMLFormElement) {
  const kind = form.dataset.kind as 'notes' | 'experiments';
  const record = store.data[kind][form.dataset.targetId!] as Note | Experiment | undefined;
  for (const textarea of form.querySelectorAll<HTMLTextAreaElement>('textarea')) textarea.value = record ? String(record[textarea.name as keyof typeof record] ?? '') : '';
  const review = form.querySelector<HTMLElement>('[data-record-review]')!;
  review.hidden = !record || record.contentVersion === form.dataset.version;
  review.textContent = '内容版本已变化，请核对原记录；点击立即保存可确认关联到当前版本。';
  recordStatus(form, record ? (notebook.handle ? '已读取笔记记录' : '已恢复浏览器草稿，尚未写入文件') : '尚无个人记录');
  dirty.delete(form);
}
function cacheForm(form: HTMLFormElement, remove = false, explicit = false) {
  const id = form.dataset.targetId!;
  const kind = form.dataset.kind as 'notes' | 'experiments';
  const next = structuredClone(store.data);
  if (remove) delete next[kind][id];
  else {
    const base = { contentVersion: explicit ? form.dataset.version! : (next[kind][id]?.contentVersion ?? form.dataset.version!), updatedAt: new Date().toISOString() };
    if (kind === 'notes') next.notes[id] = { ...base, projectId: form.dataset.projectId!, text: field(form, 'text').value };
    else next.experiments[id] = { ...base, prediction: field(form, 'prediction').value, environment: field(form, 'environment').value, observation: field(form, 'observation').value, conclusion: field(form, 'conclusion').value, correctness: field(form, 'correctness').value, elapsed: field(form, 'elapsed').value, memory: field(form, 'memory').value };
  }
  store.save(next);
  revision++;
  dirty.add(form);
  if (explicit || remove) form.querySelector<HTMLElement>('[data-record-review]')!.hidden = true;
  recordStatus(form, notebook.handle ? '等待写入文件…' : '草稿尚未写入文件，请先新建或打开笔记文件');
  showStorage();
  refreshReview();
}
async function saveAll() {
  clearTimeout(timer);
  if (!notebook.handle) { fileStatus.textContent = '尚未绑定笔记文件；草稿已保留，请新建或打开文件。'; return; }
  const snapshot = structuredClone(store.data);
  const savingRevision = revision;
  writing++;
  fileStatus.textContent = `正在保存到 ${notebook.handle.name}…`;
  try {
    await notebook.write(snapshot);
    if (revision === savingRevision) {
      for (const form of dirty) recordStatus(form, '已保存到文件');
      dirty.clear();
      progressDirty = false;
      fileStatus.textContent = `已保存到 ${notebook.handle.name}（${new Date().toLocaleTimeString()}）`;
    }
  } catch {
    fileStatus.textContent = '文件保存失败，草稿仍保留。请恢复文件访问权限后点击立即保存，或下载备份。';
    for (const form of dirty) recordStatus(form, '未能写入文件，草稿仍保留');
  } finally { writing--; }
}
for (const form of forms) {
  form.hidden = false; fillForm(form);
  form.addEventListener('input', () => {
    cacheForm(form); clearTimeout(timer);
    if (notebook.handle) timer = setTimeout(saveAll, 800);
  });
  form.addEventListener('submit', event => { event.preventDefault(); cacheForm(form, false, true); void saveAll(); });
  const confirmation = form.querySelector<HTMLElement>('[data-delete-confirm]')!;
  form.querySelector('[data-delete-record]')!.addEventListener('click', () => { confirmation.hidden = false; });
  form.querySelector('[data-cancel-delete]')!.addEventListener('click', () => { confirmation.hidden = true; });
  form.querySelector('[data-confirm-delete]')!.addEventListener('click', () => {
    cacheForm(form, true); form.reset(); confirmation.hidden = true; void saveAll();
  });
}
const refreshProgress = bindProgress(() => store.data, (id, version, learned) => {
  const next = structuredClone(store.data);
  next.mastery[id] = { contentVersion: version, learned, updatedAt: new Date().toISOString() };
  store.save(next); revision++; progressDirty = true;
  showStorage(); clearTimeout(timer);
  fileStatus.textContent = notebook.handle ? '学习状态等待写入文件…' : '学习状态已更新为草稿；请打开笔记文件后保存。';
  if (notebook.handle) timer = setTimeout(saveAll, 800);
  refreshReview();
});
const refreshReview = bindReview(() => store.data);
backup.hidden = false; showStorage();
const supported = !!picker.showOpenFilePicker && !!picker.showSaveFilePicker;
fileStatus.textContent = supported ? '尚未绑定文件：新建可迁移当前草稿；打开已有文件会先预览合并。' : '当前浏览器不支持直接写入文件，请使用桌面 Chrome / Edge；仍可编辑草稿和下载备份。';
for (const button of backup.querySelectorAll<HTMLButtonElement>('[data-new-notebook], [data-open-notebook], [data-save-notebook]')) button.disabled = !supported;
window.addEventListener('beforeunload', event => { if (((dirty.size || progressDirty) && (!store.persistent || notebook.handle)) || writing) { event.preventDefault(); event.returnValue = ''; } });
const fileTypes = [{ description: 'AI Infra 笔记文件', accept: { 'application/json': ['.json'] } }];
backup.querySelector('[data-new-notebook]')!.addEventListener('click', async () => {
  if (writing) { fileStatus.textContent = '请等待当前保存结束后再切换文件。'; return; }
  try {
    const handle = await picker.showSaveFilePicker!({ suggestedName: 'ai-infra-notebook.json', types: fileTypes });
    await notebook.connect(handle); await saveAll();
  } catch (error) { if ((error as Error).name !== 'AbortError') fileStatus.textContent = '未能打开可写文件；草稿仍保留。'; }
});
function showPreview(data: InfraData, filename: string, handle: NotebookHandle | null = null) {
  pending = data; pendingHandle = handle; pendingFilename = filename; overwrite.checked = false;
  const counts = previewImport(store.data, data, manifest);
  backup.querySelector<HTMLElement>('[data-import-summary]')!.textContent = `${filename}：新增 ${counts.added}，冲突 ${counts.conflicts}，已失效 ID ${counts.missing}，版本需复核 ${counts.outdated}。默认保留当前草稿；勾选覆盖可采用文件中的冲突记录。${handle ? '确认后将绑定这个文件并写入合并结果。' : ''}`;
  const missing = backup.querySelector<HTMLElement>('[data-import-missing]')!; missing.replaceChildren();
  for (const group of ['notes', 'experiments', 'mastery'] as const) for (const id of Object.keys(data[group])) {
    if (!Object.hasOwn(manifest[group], id)) { const item = document.createElement('li'); item.textContent = `${id}：内容已移除或本站尚未提供，原记录保留`; missing.append(item); }
  }
  preview.hidden = false; announce.textContent = '检查预览后确认；当前文件尚未改变。';
}
backup.querySelector('[data-open-notebook]')!.addEventListener('click', async () => {
  if (writing) { fileStatus.textContent = '请等待当前保存结束后再切换文件。'; return; }
  try {
    const [handle] = await picker.showOpenFilePicker!({ types: fileTypes, multiple: false });
    showPreview(await notebook.read(handle), handle.name, handle);
    preview.scrollIntoView({ block: 'center', behavior: 'instant' });
  } catch (error) { if ((error as Error).name !== 'AbortError') fileStatus.textContent = '无法打开笔记文件或格式不支持；原记录未修改。'; }
});
backup.querySelector('[data-save-notebook]')!.addEventListener('click', () => void saveAll());
backup.querySelector('[data-export-records]')!.addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([store.backup()], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `ai-infra-records-${new Date().toISOString().slice(0,10)}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); announce.textContent = '已发起备份下载，包含当前草稿；不代表已写回绑定文件。';
});
backup.querySelector<HTMLInputElement>('[data-import-file]')!.addEventListener('change', async event => {
  pending = null; pendingHandle = null; preview.hidden = true;
  const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
  try { showPreview(parseBackup(await file.text()), file.name); }
  catch { announce.textContent = '无法读取备份或版本/字段不支持，原数据未修改。'; }
});
backup.querySelector('[data-cancel-import]')!.addEventListener('click', () => { pending = null; pendingHandle = null; preview.hidden = true; announce.textContent = '已取消。'; });
backup.querySelector('[data-confirm-import]')!.addEventListener('click', async () => {
  if (!pending || writing) return;
  const next = mergeBackup(store.data, pending, overwrite.checked);
  const previousHandle = notebook.handle;
  const controls = [...forms.flatMap(form => [...form.querySelectorAll<HTMLTextAreaElement | HTMLButtonElement>('textarea, button')]), ...document.querySelectorAll<HTMLInputElement>('[data-infra-mastery]')];
  controls.forEach(control => control.disabled = true);
  clearTimeout(timer);
  try {
    if (pendingHandle) await notebook.connect(pendingHandle);
    if (notebook.handle) { writing++; try { await notebook.write(next); } finally { writing--; } }
    store.save(next); forms.forEach(fillForm); refreshProgress(); refreshReview(); progressDirty = false; revision++;
    pending = null; pendingHandle = null; preview.hidden = true;
    fileStatus.textContent = notebook.handle ? `已保存到 ${notebook.handle.name}` : '已合并到草稿，尚未写入电脑文件。';
    announce.textContent = `已处理 ${pendingFilename}。`; showStorage();
  } catch {
    notebook.handle = previousHandle;
    announce.textContent = '未能写入文件，当前草稿未被替换。请重新授权或下载备份。';
  } finally { controls.forEach(control => control.disabled = false); }
});
