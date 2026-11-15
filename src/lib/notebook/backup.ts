import type {
  DailySchedulePlan,
  MainTask,
  NotebookData,
  RoutineItem,
  SmallTask,
} from './types.ts';
import {
  formatMinutesToTime,
  parseNotebookJson,
  validateNotebookData,
} from './schema.ts';

export interface GroupImportCounts {
  added: number;
  conflicts: number;
}

export interface BackupImportPreview {
  incoming: NotebookData;
  summary: {
    routines: GroupImportCounts;
    mainTasks: GroupImportCounts;
    smallTasks: GroupImportCounts;
    schedules: GroupImportCounts;
  };
}

function countConflictsById<T extends { id: string }>(
  localItems: T[],
  incomingItems: T[],
): GroupImportCounts {
  const localIds = new Set(localItems.map((item) => item.id));
  let added = 0;
  let conflicts = 0;
  for (const item of incomingItems) {
    if (localIds.has(item.id)) conflicts++;
    else added++;
  }
  return { added, conflicts };
}

function mergeById<T extends { id: string }>(
  localItems: T[],
  incomingItems: T[],
  overwriteConflicts: boolean,
): T[] {
  const resultMap = new Map<string, T>();
  for (const item of localItems) {
    resultMap.set(item.id, item);
  }
  for (const item of incomingItems) {
    if (!resultMap.has(item.id) || overwriteConflicts) {
      resultMap.set(item.id, item);
    }
  }
  return [...resultMap.values()];
}

export function exportBackupJson(data: NotebookData): string {
  const validated = validateNotebookData(data);
  return JSON.stringify(validated, null, 2);
}

export function previewBackupImport(
  current: NotebookData,
  jsonText: string,
): BackupImportPreview {
  const incoming = parseNotebookJson(jsonText);
  const localScheduleKeys = new Set(Object.keys(current.schedulesByDate));
  let scheduleAdded = 0;
  let scheduleConflicts = 0;
  for (const dateKey of Object.keys(incoming.schedulesByDate)) {
    if (localScheduleKeys.has(dateKey)) scheduleConflicts++;
    else scheduleAdded++;
  }

  return {
    incoming,
    summary: {
      routines: countConflictsById<RoutineItem>(current.routines, incoming.routines),
      mainTasks: countConflictsById<MainTask>(current.mainTasks, incoming.mainTasks),
      smallTasks: countConflictsById<SmallTask>(current.smallTasks, incoming.smallTasks),
      schedules: { added: scheduleAdded, conflicts: scheduleConflicts },
    },
  };
}

export function mergeBackupData(
  current: NotebookData,
  incoming: NotebookData,
  strategy: 'replace' | 'merge',
  overwriteConflicts = false,
): NotebookData {
  const validIncoming = validateNotebookData(incoming);
  if (strategy === 'replace') {
    return validIncoming;
  }

  const validCurrent = validateNotebookData(current);
  const mergedSchedules: Record<string, DailySchedulePlan> = overwriteConflicts
    ? { ...validCurrent.schedulesByDate, ...validIncoming.schedulesByDate }
    : { ...validIncoming.schedulesByDate, ...validCurrent.schedulesByDate };

  const merged: NotebookData = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    routines: mergeById(validCurrent.routines, validIncoming.routines, overwriteConflicts),
    phaseSpec: overwriteConflicts ? validIncoming.phaseSpec : validCurrent.phaseSpec,
    mainTasks: mergeById(validCurrent.mainTasks, validIncoming.mainTasks, overwriteConflicts),
    smallTasks: mergeById(validCurrent.smallTasks, validIncoming.smallTasks, overwriteConflicts),
    schedulesByDate: mergedSchedules,
  };

  return validateNotebookData(merged);
}

const PERIOD_TEXT = {
  morning: '上午',
  afternoon: '下午',
  evening: '晚上',
  any: '任意时段',
} as const;

const URGENCY_TEXT = {
  today_must: '今天必做',
  soon: '近期优先',
  whenever: '顺手安排',
} as const;

const SOURCE_TYPE_TEXT = {
  routine: '固定日常',
  main_task: '主体任务',
  small_task: '突发小事',
  errand_batch: '杂务批处理',
  break: '休息调整',
} as const;

export function exportNotebookMarkdown(
  data: NotebookData,
  targetDate?: string,
): string {
  const valid = validateNotebookData(data);
  const { phaseSpec } = valid;
  const dateKey = targetDate ?? phaseSpec.startDate;
  const plan = valid.schedulesByDate[dateKey];

  const lines: string[] = [
    '# 个人记事本与时间规划表',
    '',
    `- 数据更新时间：${valid.updatedAt}`,
    `- 当前参考日期：${dateKey}`,
    '',
    '## 1. 阶段安排规范',
    '',
    `- 阶段名称：${phaseSpec.phaseTitle || '未命名阶段'}`,
    `- 阶段周期：${phaseSpec.startDate} 至 ${phaseSpec.endDate}`,
    `- 每日规划窗口：${phaseSpec.dayStart} - ${phaseSpec.dayEnd}（高强度截止：${phaseSpec.highFocusCutoffTime}）`,
    `- 深度工作偏好时段：${PERIOD_TEXT[phaseSpec.preferredDeepWorkPeriod]}`,
    `- 主体任务整块规则：最小 ${phaseSpec.minMainTaskBlockMinutes} 分钟，单块上限 ${phaseSpec.maxMainTaskBlockMinutes} 分钟，块间休息 ${phaseSpec.breakBetweenBlocksMinutes} 分钟`,
    `- 每日主任务目标：${phaseSpec.dailyMainTaskTargetMinutes} 分钟；预留杂务缓冲：${phaseSpec.reserveErrandWindowMinutes} 分钟；同类小事合并：${phaseSpec.batchSmallTasks ? '开启' : '关闭'}`,
    `- 阶段说明：${phaseSpec.guidelineNote || '无'}`,
    '',
    '## 2. 固定日常表',
    '',
  ];

  if (valid.routines.length === 0) {
    lines.push('暂无固定日常记录。');
  } else {
    for (const item of valid.routines) {
      lines.push(
        `- [${item.enabled ? '启用' : '停用'}] ${item.startTime}-${item.endTime} ${item.title}（分类：${item.category}，规律：${item.dayPattern}${item.notes ? `，备注：${item.notes}` : ''}）`,
      );
    }
  }

  lines.push('', '## 3. 阶段主体任务', '');
  if (valid.mainTasks.length === 0) {
    lines.push('暂无主体任务记录。');
  } else {
    for (const task of valid.mainTasks) {
      const pct = Math.min(100, Math.round((task.completedMinutes / task.totalEstimatedMinutes) * 100));
      lines.push(
        `- [${task.priority} / ${task.status}] ${task.title}：已完成 ${task.completedMinutes}/${task.totalEstimatedMinutes} 分钟（${pct}%），偏好${PERIOD_TEXT[task.preferredPeriod]}${task.deadline ? `，截止 ${task.deadline}` : ''}`,
      );
    }
  }

  lines.push('', '## 4. 突发小事池', '');
  if (valid.smallTasks.length === 0) {
    lines.push('暂无突发小事记录。');
  } else {
    for (const task of valid.smallTasks) {
      const windowInfo =
        task.timeWindowStart || task.timeWindowEnd
          ? `，时间窗 ${task.timeWindowStart ?? phaseSpec.dayStart}-${task.timeWindowEnd ?? phaseSpec.dayEnd}`
          : '';
      const tagInfo = task.contextTag ? `，标签 ${task.contextTag}` : '';
      lines.push(
        `- [${URGENCY_TEXT[task.urgency]} / ${task.status}] ${task.title}（约 ${task.estimatedMinutes} 分钟${windowInfo}${tagInfo}）`,
      );
    }
  }

  lines.push('', `## 5. 当日时间规划安排（${dateKey}）`, '');
  if (!plan) {
    lines.push('该日期尚未生成时间规划。');
  } else {
    lines.push(`- 生成模式：${plan.mode === 'from_now' ? '从当前时刻重排' : '全天规划'}（生成于 ${plan.generatedAt}）`, '');
    if (plan.warnings.length > 0) {
      lines.push('### 提醒与冲突说明', '');
      for (const w of plan.warnings) lines.push(`- ${w}`);
      lines.push('');
    }
    if (plan.blocks.length === 0) {
      lines.push('当日暂无已排入时间块。');
    } else {
      for (const block of plan.blocks) {
        const mark = block.completed ? 'x' : ' ';
        const lockLabel = block.locked ? ' [已锁定]' : '';
        lines.push(
          `- [${mark}] ${formatMinutesToTime(block.startMinute)}-${formatMinutesToTime(block.endMinute)} [${SOURCE_TYPE_TEXT[block.sourceType]}] ${block.title}${lockLabel} —— ${block.reason}`,
        );
      }
    }
    if (plan.unscheduledTasks.length > 0) {
      lines.push('', '### 暂未排入任务', '');
      for (const item of plan.unscheduledTasks) {
        lines.push(`- ${item.title}：${item.reason}`);
      }
    }
  }

  return lines.join('\n');
}
