import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyNotebookData, validateNotebookData } from '../src/lib/notebook/schema.ts';
import { generateDailySchedule } from '../src/lib/notebook/scheduler.ts';

function buildBaseFixture() {
  const data = createEmptyNotebookData('2026-11-16T07:00:00Z');
  data.phaseSpec = {
    ...data.phaseSpec,
    phaseTitle: '秋招与毕业项目并进阶段',
    startDate: '2026-11-16',
    endDate: '2026-11-22',
    dayStart: '08:00',
    dayEnd: '22:30',
    preferredDeepWorkPeriod: 'morning',
    minMainTaskBlockMinutes: 60,
    maxMainTaskBlockMinutes: 120,
    breakBetweenBlocksMinutes: 10,
    dailyMainTaskTargetMinutes: 240,
    reserveErrandWindowMinutes: 30,
    highFocusCutoffTime: '21:30',
    batchSmallTasks: true,
  };
  return data;
}

test('工作日/周末日常过滤与重叠日常告警；输出符合数据契约校验', () => {
  const data = buildBaseFixture();
  data.routines.push(
    {
      id: 'nb-routine-weekday-class',
      title: '工作日专业课',
      category: 'study',
      startTime: '08:30',
      endTime: '10:00',
      dayPattern: 'weekdays',
      enabled: true,
      updatedAt: '2026-11-16T07:00:00Z',
    },
    {
      id: 'nb-routine-weekend-run',
      title: '周末晨跑',
      category: 'exercise',
      startTime: '08:30',
      endTime: '09:30',
      dayPattern: 'weekends',
      enabled: true,
      updatedAt: '2026-11-16T07:00:00Z',
    },
    {
      id: 'nb-routine-lunch',
      title: '午饭与午休',
      category: 'meal',
      startTime: '12:00',
      endTime: '13:30',
      dayPattern: 'everyday',
      enabled: true,
      updatedAt: '2026-11-16T07:00:00Z',
    },
    {
      id: 'nb-routine-overlap',
      title: '临时重合日常',
      category: 'other',
      startTime: '13:00',
      endTime: '14:00',
      dayPattern: 'weekdays',
      enabled: true,
      updatedAt: '2026-11-16T07:00:00Z',
    },
  );

  // 2026-11-16 是周一（工作日）
  const weekdayPlan = generateDailySchedule(data, {
    targetDate: '2026-11-16',
    mode: 'full_day',
  });
  const weekdayTitles = weekdayPlan.blocks.filter((b) => b.sourceType === 'routine').map((b) => b.title);
  assert.deepEqual(weekdayTitles, ['工作日专业课', '午饭与午休', '临时重合日常']);
  assert.equal(weekdayPlan.warnings.length, 1);
  assert.match(weekdayPlan.warnings[0], /时间重叠/);

  // 2026-11-15 是周日（周末）
  const weekendPlan = generateDailySchedule(data, {
    targetDate: '2026-11-15',
    mode: 'full_day',
  });
  const weekendTitles = weekendPlan.blocks.filter((b) => b.sourceType === 'routine').map((b) => b.title);
  assert.deepEqual(weekendTitles, ['周末晨跑', '午饭与午休']);
  assert.equal(weekendPlan.warnings.length, 0);

  data.schedulesByDate['2026-11-16'] = weekdayPlan;
  assert.doesNotThrow(() => validateNotebookData(data));
});

test('主体任务整块保护不被小事切碎，短碎片空隙优先安排突发小事与同类批处理', () => {
  const data = buildBaseFixture();
  // 08:00-08:30 空 30m（短于 60m 主任务最小块），08:30-12:00 空 210m（整块留给主任务）
  // 12:00-13:30 午休，13:30-14:00 空 30m，14:00-18:00 固定日程，18:00-19:00 晚饭，19:00-22:30 空
  data.routines.push(
    {
      id: 'nb-routine-prep',
      title: '早间固定阅读',
      category: 'study',
      startTime: '08:30',
      endTime: '09:00',
      dayPattern: 'everyday',
      enabled: true,
      updatedAt: '2026-11-16T07:00:00Z',
    },
    {
      id: 'nb-routine-lunch',
      title: '午饭午休',
      category: 'meal',
      startTime: '12:00',
      endTime: '13:30',
      dayPattern: 'everyday',
      enabled: true,
      updatedAt: '2026-11-16T07:00:00Z',
    },
    {
      id: 'nb-routine-dinner',
      title: '晚饭散步',
      category: 'meal',
      startTime: '18:00',
      endTime: '19:00',
      dayPattern: 'everyday',
      enabled: true,
      updatedAt: '2026-11-16T07:00:00Z',
    },
  );
  data.mainTasks.push({
    id: 'nb-main-core',
    title: '重构推理引擎核心文档',
    priority: 'P0',
    totalEstimatedMinutes: 240,
    completedMinutes: 0,
    dailyQuotaMinutes: 180,
    minSessionMinutes: 60,
    preferredPeriod: 'morning',
    status: 'active',
    updatedAt: '2026-11-16T07:00:00Z',
  });
  data.smallTasks.push(
    {
      id: 'nb-small-mail',
      title: '回复导师邮件',
      estimatedMinutes: 15,
      urgency: 'soon',
      preferredPeriod: 'any',
      contextTag: '@电脑',
      status: 'pending',
      updatedAt: '2026-11-16T07:00:00Z',
    },
    {
      id: 'nb-small-form',
      title: '填写报销表格',
      estimatedMinutes: 15,
      urgency: 'whenever',
      preferredPeriod: 'any',
      contextTag: '@电脑',
      status: 'pending',
      updatedAt: '2026-11-16T07:00:00Z',
    },
  );

  const plan = generateDailySchedule(data, {
    targetDate: '2026-11-16',
    mode: 'full_day',
  });

  const mainBlocks = plan.blocks.filter((b) => b.sourceType === 'main_task');
  assert.ok(mainBlocks.length >= 1);
  // 09:00-12:00 有 180 分钟整块，P0 主任务首块应拿到上限 120 分钟（09:00-11:00）
  assert.equal(mainBlocks[0].startMinute, 540);
  assert.equal(mainBlocks[0].endMinute, 660);

  // 合并后的 30 分钟 @电脑 批处理优先填入 08:00-08:30 的 30 分钟天然短空隙，不打碎上午大块
  const batchBlock = plan.blocks.find((b) => b.sourceType === 'errand_batch');
  assert.ok(batchBlock);
  assert.equal(batchBlock.startMinute, 480);
  assert.equal(batchBlock.endMinute, 510);
  assert.deepEqual(batchBlock.sourceIds.sort(), ['nb-small-form', 'nb-small-mail']);

  // 验证无非日常块重叠
  const nonRoutine = plan.blocks.filter((b) => b.sourceType !== 'routine');
  for (let i = 1; i < nonRoutine.length; i++) {
    assert.ok(nonRoutine[i - 1].endMinute <= nonRoutine[i].startMinute);
  }
});

test('today_must 突发小事抢占让位、时间窗冲突记录及 from_now 保留锁定与已完成块', () => {
  const data = buildBaseFixture();
  // 全天只有一个 09:00-11:00 空闲窗口（其余都被日常占满），用来测试抢占与未排入
  data.phaseSpec.reserveErrandWindowMinutes = 0;
  data.phaseSpec.breakBetweenBlocksMinutes = 0;
  data.routines.push(
    {
      id: 'nb-routine-morn',
      title: '早间事务',
      category: 'work',
      startTime: '08:00',
      endTime: '09:00',
      dayPattern: 'everyday',
      enabled: true,
      updatedAt: '2026-11-16T07:00:00Z',
    },
    {
      id: 'nb-routine-rest-day',
      title: '下午至夜间课程与安排',
      category: 'work',
      startTime: '11:00',
      endTime: '22:30',
      dayPattern: 'everyday',
      enabled: true,
      updatedAt: '2026-11-16T07:00:00Z',
    },
  );
  data.mainTasks.push({
    id: 'nb-main-low',
    title: '整理文献综述',
    priority: 'P2',
    totalEstimatedMinutes: 120,
    completedMinutes: 0,
    preferredPeriod: 'morning',
    status: 'active',
    updatedAt: '2026-11-16T07:00:00Z',
  });
  data.smallTasks.push(
    {
      id: 'nb-small-urgent',
      title: '校医院取体检报告',
      estimatedMinutes: 30,
      urgency: 'today_must',
      preferredPeriod: 'morning',
      status: 'pending',
      updatedAt: '2026-11-16T07:00:00Z',
    },
    {
      id: 'nb-small-impossible',
      title: '下午五点取干洗店衣物',
      estimatedMinutes: 20,
      urgency: 'soon',
      timeWindowStart: '17:00',
      timeWindowEnd: '18:00',
      preferredPeriod: 'afternoon',
      status: 'pending',
      updatedAt: '2026-11-16T07:00:00Z',
    },
  );

  const plan = generateDailySchedule(data, {
    targetDate: '2026-11-16',
    mode: 'full_day',
  });

  const urgentBlock = plan.blocks.find((b) => b.sourceIds.includes('nb-small-urgent'));
  assert.ok(urgentBlock);
  assert.equal(urgentBlock.endMinute - urgentBlock.startMinute, 30);
  assert.ok(plan.warnings.some((w) => w.includes('校医院取体检报告')));

  const mainBlock = plan.blocks.find((b) => b.sourceIds.includes('nb-main-low'));
  assert.ok(mainBlock);
  assert.equal(mainBlock.endMinute - mainBlock.startMinute, 90);

  const missed = plan.unscheduledTasks.find((u) => u.taskId === 'nb-small-impossible');
  assert.ok(missed);
  assert.match(missed.reason, /17:00-18:00/);

  // 验证 from_now 模式保留已完成与锁定块，不会覆盖或重复排入
  const lockedPlan = {
    ...plan,
    blocks: plan.blocks.map((b) =>
      b.sourceIds.includes('nb-main-low')
        ? { ...b, locked: true, completed: true, creditedMinutes: 90 }
        : b,
    ),
  };
  data.mainTasks[0].completedMinutes = 90;
  const replanned = generateDailySchedule(data, {
    targetDate: '2026-11-16',
    mode: 'from_now',
    nowMinutes: 600, // 10:00
    existingPlan: lockedPlan,
  });
  const preservedMain = replanned.blocks.find((b) => b.sourceIds.includes('nb-main-low'));
  assert.ok(preservedMain);
  assert.equal(preservedMain.locked, true);
  assert.equal(preservedMain.completed, true);
  assert.equal(replanned.blocks.filter((b) => b.sourceIds.includes('nb-main-low')).length, 1);
});
