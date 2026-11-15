import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyNotebookData, parseNotebookJson } from '../src/lib/notebook/schema.ts';
import { generateDailySchedule } from '../src/lib/notebook/scheduler.ts';
import {
  exportBackupJson,
  exportNotebookMarkdown,
  mergeBackupData,
  previewBackupImport,
} from '../src/lib/notebook/backup.ts';

function createFixture(titleSuffix) {
  const data = createEmptyNotebookData('2026-11-16T08:00:00Z');
  data.phaseSpec.phaseTitle = `阶段-${titleSuffix}`;
  data.phaseSpec.startDate = '2026-11-16';
  data.phaseSpec.endDate = '2026-11-22';
  data.routines.push({
    id: 'nb-routine-lunch',
    title: `午饭-${titleSuffix}`,
    category: 'meal',
    startTime: '12:00',
    endTime: '13:30',
    dayPattern: 'everyday',
    enabled: true,
    updatedAt: '2026-11-16T08:00:00Z',
  });
  data.mainTasks.push({
    id: 'nb-main-1',
    title: `主任务-${titleSuffix}`,
    priority: 'P0',
    totalEstimatedMinutes: 180,
    completedMinutes: 30,
    preferredPeriod: 'morning',
    status: 'active',
    updatedAt: '2026-11-16T08:00:00Z',
  });
  data.smallTasks.push({
    id: 'nb-small-1',
    title: `小事-${titleSuffix}`,
    estimatedMinutes: 20,
    urgency: 'today_must',
    preferredPeriod: 'any',
    contextTag: '@出门',
    status: 'pending',
    updatedAt: '2026-11-16T08:00:00Z',
  });
  return data;
}

test('JSON 备份导出、导入预览冲突统计以及 replace/merge 策略', () => {
  const local = createFixture('本地');
  const incoming = createFixture('导入');
  incoming.smallTasks.push({
    id: 'nb-small-2',
    title: '新增小事',
    estimatedMinutes: 15,
    urgency: 'soon',
    preferredPeriod: 'afternoon',
    status: 'pending',
    updatedAt: '2026-11-16T09:00:00Z',
  });

  const json = exportBackupJson(incoming);
  assert.deepEqual(parseNotebookJson(json), incoming);

  const preview = previewBackupImport(local, json);
  assert.deepEqual(preview.summary, {
    routines: { added: 0, conflicts: 1 },
    mainTasks: { added: 0, conflicts: 1 },
    smallTasks: { added: 1, conflicts: 1 },
    schedules: { added: 0, conflicts: 0 },
  });

  const keepLocal = mergeBackupData(local, preview.incoming, 'merge', false);
  assert.equal(keepLocal.phaseSpec.phaseTitle, '阶段-本地');
  assert.equal(keepLocal.mainTasks[0].title, '主任务-本地');
  assert.equal(keepLocal.smallTasks.length, 2);
  assert.equal(keepLocal.smallTasks.find((t) => t.id === 'nb-small-1')?.title, '小事-本地');

  const overwriteLocal = mergeBackupData(local, preview.incoming, 'merge', true);
  assert.equal(overwriteLocal.phaseSpec.phaseTitle, '阶段-导入');
  assert.equal(overwriteLocal.mainTasks[0].title, '主任务-导入');
  assert.equal(overwriteLocal.smallTasks.find((t) => t.id === 'nb-small-1')?.title, '小事-导入');

  const replaced = mergeBackupData(local, preview.incoming, 'replace');
  assert.deepEqual(replaced, incoming);

  assert.throws(() => previewBackupImport(local, '{"schemaVersion": 99}'));
});

test('Markdown 规划表导出包含五大章节与纯文本原样保留', () => {
  const data = createFixture('毕业设计');
  data.phaseSpec.guidelineNote = '保留 <b>标签</b> 纯文本';
  data.schedulesByDate['2026-11-16'] = generateDailySchedule(data, {
    targetDate: '2026-11-16',
    mode: 'full_day',
  });

  const md = exportNotebookMarkdown(data, '2026-11-16');
  assert.match(md, /## 1\. 阶段安排规范/);
  assert.match(md, /## 2\. 固定日常表/);
  assert.match(md, /## 3\. 阶段主体任务/);
  assert.match(md, /## 4\. 突发小事池/);
  assert.match(md, /## 5\. 当日时间规划安排（2026-11-16）/);
  assert.ok(md.includes('保留 <b>标签</b> 纯文本'));
  assert.ok(md.includes('主任务-毕业设计'));
  assert.ok(md.includes('小事-毕业设计'));
});
