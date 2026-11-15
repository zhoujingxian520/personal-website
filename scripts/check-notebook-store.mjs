import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyNotebookData,
  formatMinutesToTime,
  isValidDateString,
  parseNotebookJson,
  parseTimeToMinutes,
  validateNotebookData,
} from '../src/lib/notebook/schema.ts';
import { NotebookStore, STORAGE_KEY } from '../src/lib/notebook/storage.ts';

function createMemoryStorage(initial = null) {
  const map = new Map();
  if (initial !== null) map.set(STORAGE_KEY, initial);
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
  };
}

test('时间日期工具与默认结构初始化、保存刷新和 JSON 往返恢复', () => {
  assert.equal(parseTimeToMinutes('00:00'), 0);
  assert.equal(parseTimeToMinutes('08:30'), 510);
  assert.equal(parseTimeToMinutes('24:00'), 1440);
  assert.equal(formatMinutesToTime(510), '08:30');
  assert.equal(formatMinutesToTime(1440), '24:00');
  assert.throws(() => parseTimeToMinutes('24:01'));
  assert.throws(() => parseTimeToMinutes('8:30'));
  assert.throws(() => parseTimeToMinutes('abc'));

  assert.equal(isValidDateString('2026-11-15'), true);
  assert.equal(isValidDateString('2026-02-30'), false);
  assert.equal(isValidDateString('2026-13-01'), false);

  const storage = createMemoryStorage();
  const store = new NotebookStore(() => storage, '2026-11-15T10:00:00Z');
  assert.equal(store.persistent, true);
  assert.equal(store.issue, '');
  assert.equal(store.data.schemaVersion, 1);

  const next = createEmptyNotebookData('2026-11-15T10:05:00Z');
  next.phaseSpec.phaseTitle = '毕业设计冲刺周';
  next.phaseSpec.guidelineNote = '上午优先整块时间推进主任务；保留 <script>alert(1)</script> 原样文本';
  next.routines.push({
    id: 'nb-routine-lunch',
    title: '午饭与午休',
    category: 'meal',
    startTime: '12:00',
    endTime: '13:30',
    dayPattern: 'everyday',
    enabled: true,
    updatedAt: '2026-11-15T10:05:00Z',
  });
  next.mainTasks.push({
    id: 'nb-main-thesis',
    title: '完成实验章节初稿',
    priority: 'P0',
    totalEstimatedMinutes: 360,
    completedMinutes: 90,
    dailyQuotaMinutes: 120,
    minSessionMinutes: 60,
    preferredPeriod: 'morning',
    deadline: '2026-11-22',
    status: 'active',
    updatedAt: '2026-11-15T10:05:00Z',
  });
  next.smallTasks.push({
    id: 'nb-small-parcel',
    title: '下楼取快递',
    estimatedMinutes: 15,
    urgency: 'today_must',
    targetDate: '2026-11-15',
    timeWindowStart: '17:00',
    timeWindowEnd: '19:00',
    preferredPeriod: 'afternoon',
    contextTag: '@出门',
    status: 'pending',
    updatedAt: '2026-11-15T10:05:00Z',
  });
  next.schedulesByDate['2026-11-15'] = {
    date: '2026-11-15',
    generatedAt: '2026-11-15T10:05:00Z',
    mode: 'full_day',
    blocks: [
      {
        id: 'nb-block-1',
        date: '2026-11-15',
        sourceType: 'main_task',
        sourceIds: ['nb-main-thesis'],
        title: '完成实验章节初稿',
        startMinute: 540,
        endMinute: 660,
        locked: false,
        completed: false,
        creditedMinutes: 0,
        reason: '上午深度学习时段优先安排 P0 主体任务',
      },
    ],
    unscheduledTasks: [],
    warnings: [],
  };

  assert.equal(store.save(next), true);
  const reloaded = new NotebookStore(() => storage);
  assert.deepEqual(reloaded.data, next);
  assert.deepEqual(parseNotebookJson(reloaded.serialize()), next);
});

test('非法字段、时间倒置、损坏 JSON 与未知版本均被严格拦截', () => {
  assert.throws(() => parseNotebookJson('{broken json'));
  assert.throws(() => parseNotebookJson(JSON.stringify({ ...createEmptyNotebookData(), schemaVersion: 2 })));

  const badRoutine = createEmptyNotebookData();
  badRoutine.routines.push({
    id: 'nb-routine-bad',
    title: '倒置日常',
    category: 'other',
    startTime: '14:00',
    endTime: '13:00',
    dayPattern: 'everyday',
    enabled: true,
    updatedAt: '2026-11-15T10:00:00Z',
  });
  assert.throws(() => validateNotebookData(badRoutine));

  const badSmallTask = createEmptyNotebookData();
  badSmallTask.smallTasks.push({
    id: 'nb-small-bad',
    title: '非法时间窗',
    estimatedMinutes: 20,
    urgency: 'soon',
    timeWindowStart: '18:00',
    timeWindowEnd: '17:00',
    preferredPeriod: 'any',
    status: 'pending',
    updatedAt: '2026-11-15T10:00:00Z',
  });
  assert.throws(() => validateNotebookData(badSmallTask));

  const badMainTask = createEmptyNotebookData();
  badMainTask.mainTasks.push({
    id: 'nb-main-bad',
    title: '无效工时',
    priority: 'P1',
    totalEstimatedMinutes: 0,
    completedMinutes: -10,
    preferredPeriod: 'morning',
    status: 'active',
    updatedAt: '2026-11-15T10:00:00Z',
  });
  assert.throws(() => validateNotebookData(badMainTask));

  const duplicateMain = createEmptyNotebookData();
  const sampleTask = {
    id: 'nb-main-dup',
    title: '任务一',
    priority: 'P1',
    totalEstimatedMinutes: 60,
    completedMinutes: 0,
    preferredPeriod: 'any',
    status: 'active',
    updatedAt: '2026-11-15T10:00:00Z',
  };
  duplicateMain.mainTasks.push(sampleTask, { ...sampleTask, title: '重复 ID 任务' });
  assert.throws(() => validateNotebookData(duplicateMain));
});

test('存储损坏与写入失败时保留原存储并降级为可导出的会话模式', () => {
  const corruptedRaw = '{corrupted-data';
  const corruptedStorage = createMemoryStorage(corruptedRaw);
  const recoveredStore = new NotebookStore(() => corruptedStorage, '2026-11-15T10:00:00Z');
  assert.equal(recoveredStore.persistent, false);
  assert.ok(recoveredStore.issue.length > 0);
  assert.equal(corruptedStorage.getItem(STORAGE_KEY), corruptedRaw);

  const disabledStore = new NotebookStore(() => {
    throw new Error('storage disabled');
  }, '2026-11-15T10:00:00Z');
  assert.equal(disabledStore.persistent, false);
  const draft = createEmptyNotebookData('2026-11-15T10:10:00Z');
  draft.phaseSpec.phaseTitle = '离线会话草稿';
  assert.throws(() => disabledStore.save(draft, true));
  assert.equal(disabledStore.save(draft, false), false);
  assert.equal(parseNotebookJson(disabledStore.serialize()).phaseSpec.phaseTitle, '离线会话草稿');

  const initialData = createEmptyNotebookData('2026-11-15T10:00:00Z');
  const initialRaw = JSON.stringify(initialData);
  const quotaStorage = {
    getItem: (key) => (key === STORAGE_KEY ? initialRaw : null),
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  const quotaStore = new NotebookStore(() => quotaStorage);
  assert.equal(quotaStore.persistent, true);

  const updated = createEmptyNotebookData('2026-11-15T10:20:00Z');
  updated.phaseSpec.phaseTitle = '配额失败保留会话';
  assert.throws(() => quotaStore.save(updated, true));
  assert.deepEqual(quotaStore.data, initialData);
  assert.equal(quotaStore.save(updated, false), false);
  assert.equal(quotaStore.persistent, false);
  assert.ok(quotaStore.issue.length > 0);
  assert.equal(quotaStorage.getItem(STORAGE_KEY), initialRaw);
  assert.equal(parseNotebookJson(quotaStore.serialize()).phaseSpec.phaseTitle, '配额失败保留会话');
});
