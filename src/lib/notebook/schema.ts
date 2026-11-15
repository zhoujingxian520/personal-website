import type {
  DailySchedulePlan,
  DayPattern,
  MainTask,
  NotebookData,
  PhaseRuleConfig,
  PriorityLevel,
  RoutineCategory,
  RoutineItem,
  ScheduledBlock,
  SmallTask,
  SmallTaskUrgency,
  TimeOfDay,
  UnscheduledTaskNote,
} from './types.ts';

const TIME_PATTERN = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ROUTINE_ID_PATTERN = /^nb-routine-[a-z0-9][a-z0-9-]*$/;
const MAIN_ID_PATTERN = /^nb-main-[a-z0-9][a-z0-9-]*$/;
const SMALL_ID_PATTERN = /^nb-small-[a-z0-9][a-z0-9-]*$/;

const TIME_OF_DAY_SET = new Set<TimeOfDay>(['morning', 'afternoon', 'evening', 'any']);
const DAY_PATTERN_SET = new Set<DayPattern>(['everyday', 'weekdays', 'weekends', 'custom']);
const PRIORITY_SET = new Set<PriorityLevel>(['P0', 'P1', 'P2']);
const URGENCY_SET = new Set<SmallTaskUrgency>(['today_must', 'soon', 'whenever']);
const CATEGORY_SET = new Set<RoutineCategory>(['sleep', 'meal', 'work', 'study', 'exercise', 'commute', 'other']);
const MAIN_STATUS_SET = new Set(['active', 'paused', 'completed'] as const);
const SMALL_STATUS_SET = new Set(['pending', 'done', 'cancelled'] as const);
const BLOCK_SOURCE_SET = new Set(['routine', 'main_task', 'small_task', 'errand_batch', 'break'] as const);
const PLAN_MODE_SET = new Set(['full_day', 'from_now'] as const);

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label}必须是非空字符串。`);
  }
  return value;
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label}必须是字符串。`);
  }
  return value;
}

function assertOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return assertString(value, label);
}

function assertBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label}必须是布尔值。`);
  }
  return value;
}

function assertIntInRange(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label}必须是 ${min} 到 ${max} 之间的整数。`);
  }
  return value;
}

function assertEnum<T extends string>(value: unknown, allowed: Set<T>, label: string): T {
  if (typeof value !== 'string' || !allowed.has(value as T)) {
    throw new Error(`${label}取值无效。`);
  }
  return value as T;
}

export function isValidTimeString(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

export function parseTimeToMinutes(time: string): number {
  if (!isValidTimeString(time)) {
    throw new Error(`时间格式无效（应为 HH:mm）：${String(time)}`);
  }
  const [hourText, minuteText] = time.split(':');
  return Number(hourText) * 60 + Number(minuteText);
}

export function formatMinutesToTime(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
    throw new Error(`分钟数超出有效范围（0–1440）：${String(minutes)}`);
  }
  const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
  const minute = String(minutes % 60).padStart(2, '0');
  return `${hour}:${minute}`;
}

export function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function addDaysToDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function createNotebookId(prefix: 'nb-routine' | 'nb-main' | 'nb-small' | 'nb-block'): string {
  const raw = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${raw.toLowerCase().replace(/[^a-z0-9]/g, '0')}`;
}

export function createEmptyNotebookData(nowIso = new Date().toISOString()): NotebookData {
  const maybeDate = nowIso.slice(0, 10);
  const startDate = isValidDateString(maybeDate) ? maybeDate : new Date().toISOString().slice(0, 10);
  const endDate = addDaysToDateString(startDate, 6);
  return {
    schemaVersion: 1,
    updatedAt: nowIso,
    routines: [],
    phaseSpec: {
      phaseTitle: '',
      startDate,
      endDate,
      guidelineNote: '',
      dayStart: '07:30',
      dayEnd: '23:00',
      preferredDeepWorkPeriod: 'morning',
      minMainTaskBlockMinutes: 60,
      maxMainTaskBlockMinutes: 120,
      breakBetweenBlocksMinutes: 10,
      dailyMainTaskTargetMinutes: 240,
      reserveErrandWindowMinutes: 30,
      highFocusCutoffTime: '21:30',
      batchSmallTasks: true,
      updatedAt: nowIso,
    },
    mainTasks: [],
    smallTasks: [],
    schedulesByDate: {},
  };
}

function validateRoutineItem(raw: unknown, index: number, seenIds: Set<string>): RoutineItem {
  const prefix = `固定日常第 ${index + 1} 项`;
  if (!isObject(raw)) throw new Error(`${prefix}格式无效。`);
  const id = assertNonEmptyString(raw.id, `${prefix}的 ID`);
  if (!ROUTINE_ID_PATTERN.test(id)) throw new Error(`${prefix}的 ID 格式无效：${id}`);
  if (seenIds.has(id)) throw new Error(`固定日常存在重复 ID：${id}`);
  seenIds.add(id);

  const title = assertNonEmptyString(raw.title, `${prefix}标题`);
  const category = assertEnum(raw.category, CATEGORY_SET, `${prefix}分类`);
  const startTime = assertString(raw.startTime, `${prefix}开始时间`);
  const endTime = assertString(raw.endTime, `${prefix}结束时间`);
  if (parseTimeToMinutes(startTime) >= parseTimeToMinutes(endTime)) {
    throw new Error(`${prefix}结束时间必须晚于开始时间。`);
  }

  const dayPattern = assertEnum(raw.dayPattern, DAY_PATTERN_SET, `${prefix}重复规则`);
  let customDays: number[] | undefined;
  if (raw.customDays !== undefined) {
    if (!Array.isArray(raw.customDays)) throw new Error(`${prefix}自定义星期必须是数组。`);
    const deduped = new Set<number>();
    for (const day of raw.customDays) {
      deduped.add(assertIntInRange(day, 0, 6, `${prefix}星期值`));
    }
    customDays = [...deduped].sort((a, b) => a - b);
  }
  if (dayPattern === 'custom' && (!customDays || customDays.length === 0)) {
    throw new Error(`${prefix}选择自定义星期时至少需要指定一天。`);
  }

  const enabled = assertBoolean(raw.enabled, `${prefix}启用状态`);
  const notes = assertOptionalString(raw.notes, `${prefix}备注`);
  const updatedAt = assertNonEmptyString(raw.updatedAt, `${prefix}更新时间`);

  const result: RoutineItem = {
    id,
    title,
    category,
    startTime,
    endTime,
    dayPattern,
    enabled,
    updatedAt,
  };
  if (customDays !== undefined) result.customDays = customDays;
  if (notes !== undefined) result.notes = notes;
  return result;
}

function validatePhaseSpec(raw: unknown): PhaseRuleConfig {
  if (!isObject(raw)) throw new Error('阶段规范 phaseSpec 格式无效。');
  const phaseTitle = assertString(raw.phaseTitle, '阶段名称');
  const startDate = assertString(raw.startDate, '阶段开始日期');
  const endDate = assertString(raw.endDate, '阶段结束日期');
  if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
    throw new Error('阶段起止日期格式无效（应为 YYYY-MM-DD）。');
  }
  if (startDate > endDate) {
    throw new Error('阶段结束日期不能早于开始日期。');
  }

  const guidelineNote = assertString(raw.guidelineNote, '阶段规范说明');
  const dayStart = assertString(raw.dayStart, '每日规划开始时间');
  const dayEnd = assertString(raw.dayEnd, '每日规划结束时间');
  if (parseTimeToMinutes(dayStart) >= parseTimeToMinutes(dayEnd)) {
    throw new Error('每日规划结束时间必须晚于开始时间。');
  }

  const preferredDeepWorkPeriod = assertEnum(
    raw.preferredDeepWorkPeriod,
    new Set<'morning' | 'afternoon' | 'evening'>(['morning', 'afternoon', 'evening']),
    '深度工作偏好时段',
  );
  const minMainTaskBlockMinutes = assertIntInRange(raw.minMainTaskBlockMinutes, 15, 240, '主任务最小整块时长');
  const maxMainTaskBlockMinutes = assertIntInRange(
    raw.maxMainTaskBlockMinutes,
    minMainTaskBlockMinutes,
    480,
    '主任务最大连续时长',
  );
  const breakBetweenBlocksMinutes = assertIntInRange(raw.breakBetweenBlocksMinutes, 0, 60, '整块间休息时长');
  const dailyMainTaskTargetMinutes = assertIntInRange(raw.dailyMainTaskTargetMinutes, 30, 720, '每日主任务目标时长');
  const reserveErrandWindowMinutes = assertIntInRange(raw.reserveErrandWindowMinutes, 0, 180, '每日预留杂务窗口');

  const highFocusCutoffTime = assertString(raw.highFocusCutoffTime, '高强度任务截止时间');
  parseTimeToMinutes(highFocusCutoffTime);

  const batchSmallTasks = assertBoolean(raw.batchSmallTasks, '小事同类合并开关');
  const updatedAt = assertNonEmptyString(raw.updatedAt, '阶段规范更新时间');

  return {
    phaseTitle,
    startDate,
    endDate,
    guidelineNote,
    dayStart,
    dayEnd,
    preferredDeepWorkPeriod,
    minMainTaskBlockMinutes,
    maxMainTaskBlockMinutes,
    breakBetweenBlocksMinutes,
    dailyMainTaskTargetMinutes,
    reserveErrandWindowMinutes,
    highFocusCutoffTime,
    batchSmallTasks,
    updatedAt,
  };
}

function validateMainTask(raw: unknown, index: number, seenIds: Set<string>): MainTask {
  const prefix = `主体任务第 ${index + 1} 项`;
  if (!isObject(raw)) throw new Error(`${prefix}格式无效。`);
  const id = assertNonEmptyString(raw.id, `${prefix}的 ID`);
  if (!MAIN_ID_PATTERN.test(id)) throw new Error(`${prefix}的 ID 格式无效：${id}`);
  if (seenIds.has(id)) throw new Error(`主体任务存在重复 ID：${id}`);
  seenIds.add(id);

  const title = assertNonEmptyString(raw.title, `${prefix}标题`);
  const description = assertOptionalString(raw.description, `${prefix}说明`);
  const priority = assertEnum(raw.priority, PRIORITY_SET, `${prefix}优先级`);
  const totalEstimatedMinutes = assertIntInRange(raw.totalEstimatedMinutes, 1, 100000, `${prefix}预计总耗时`);
  const completedMinutes = assertIntInRange(raw.completedMinutes, 0, 100000, `${prefix}已完成耗时`);

  const dailyQuotaMinutes = raw.dailyQuotaMinutes === undefined
    ? undefined
    : assertIntInRange(raw.dailyQuotaMinutes, 15, 720, `${prefix}每日投入目标`);
  const minSessionMinutes = raw.minSessionMinutes === undefined
    ? undefined
    : assertIntInRange(raw.minSessionMinutes, 15, 240, `${prefix}单次最小时长`);

  const preferredPeriod = assertEnum(raw.preferredPeriod, TIME_OF_DAY_SET, `${prefix}偏好时段`);
  let deadline: string | undefined;
  if (raw.deadline !== undefined) {
    deadline = assertString(raw.deadline, `${prefix}截止日期`);
    if (!isValidDateString(deadline)) throw new Error(`${prefix}截止日期格式无效：${deadline}`);
  }
  const status = assertEnum(raw.status, MAIN_STATUS_SET, `${prefix}状态`);
  const updatedAt = assertNonEmptyString(raw.updatedAt, `${prefix}更新时间`);

  const result: MainTask = {
    id,
    title,
    priority,
    totalEstimatedMinutes,
    completedMinutes,
    preferredPeriod,
    status,
    updatedAt,
  };
  if (description !== undefined) result.description = description;
  if (dailyQuotaMinutes !== undefined) result.dailyQuotaMinutes = dailyQuotaMinutes;
  if (minSessionMinutes !== undefined) result.minSessionMinutes = minSessionMinutes;
  if (deadline !== undefined) result.deadline = deadline;
  return result;
}

function validateSmallTask(raw: unknown, index: number, seenIds: Set<string>): SmallTask {
  const prefix = `突发小事第 ${index + 1} 项`;
  if (!isObject(raw)) throw new Error(`${prefix}格式无效。`);
  const id = assertNonEmptyString(raw.id, `${prefix}的 ID`);
  if (!SMALL_ID_PATTERN.test(id)) throw new Error(`${prefix}的 ID 格式无效：${id}`);
  if (seenIds.has(id)) throw new Error(`突发小事存在重复 ID：${id}`);
  seenIds.add(id);

  const title = assertNonEmptyString(raw.title, `${prefix}标题`);
  const estimatedMinutes = assertIntInRange(raw.estimatedMinutes, 5, 240, `${prefix}预估耗时`);
  const urgency = assertEnum(raw.urgency, URGENCY_SET, `${prefix}紧急程度`);

  let targetDate: string | undefined;
  if (raw.targetDate !== undefined) {
    targetDate = assertString(raw.targetDate, `${prefix}目标日期`);
    if (!isValidDateString(targetDate)) throw new Error(`${prefix}目标日期格式无效：${targetDate}`);
  }

  let timeWindowStart: string | undefined;
  if (raw.timeWindowStart !== undefined) {
    timeWindowStart = assertString(raw.timeWindowStart, `${prefix}时间窗开始`);
    parseTimeToMinutes(timeWindowStart);
  }
  let timeWindowEnd: string | undefined;
  if (raw.timeWindowEnd !== undefined) {
    timeWindowEnd = assertString(raw.timeWindowEnd, `${prefix}时间窗结束`);
    parseTimeToMinutes(timeWindowEnd);
  }
  if (
    timeWindowStart !== undefined &&
    timeWindowEnd !== undefined &&
    parseTimeToMinutes(timeWindowStart) >= parseTimeToMinutes(timeWindowEnd)
  ) {
    throw new Error(`${prefix}时间窗结束时间必须晚于开始时间。`);
  }

  const preferredPeriod = assertEnum(raw.preferredPeriod, TIME_OF_DAY_SET, `${prefix}偏好时段`);
  const contextTag = assertOptionalString(raw.contextTag, `${prefix}场景标签`);
  const status = assertEnum(raw.status, SMALL_STATUS_SET, `${prefix}状态`);
  const updatedAt = assertNonEmptyString(raw.updatedAt, `${prefix}更新时间`);

  const result: SmallTask = {
    id,
    title,
    estimatedMinutes,
    urgency,
    preferredPeriod,
    status,
    updatedAt,
  };
  if (targetDate !== undefined) result.targetDate = targetDate;
  if (timeWindowStart !== undefined) result.timeWindowStart = timeWindowStart;
  if (timeWindowEnd !== undefined) result.timeWindowEnd = timeWindowEnd;
  if (contextTag !== undefined) result.contextTag = contextTag;
  return result;
}

function validateScheduledBlock(raw: unknown, expectedDate: string, index: number): ScheduledBlock {
  const prefix = `日程 ${expectedDate} 第 ${index + 1} 个时间块`;
  if (!isObject(raw)) throw new Error(`${prefix}格式无效。`);

  const id = assertNonEmptyString(raw.id, `${prefix}的 ID`);
  const date = assertString(raw.date, `${prefix}日期`);
  if (date !== expectedDate) throw new Error(`${prefix}日期与所属日程日期不一致。`);
  const sourceType = assertEnum(raw.sourceType, BLOCK_SOURCE_SET, `${prefix}来源类型`);

  if (!Array.isArray(raw.sourceIds)) throw new Error(`${prefix}来源 ID 列表必须是数组。`);
  const sourceIds = raw.sourceIds.map((item, idx) => assertNonEmptyString(item, `${prefix}来源 ID[${idx}]`));

  const title = assertNonEmptyString(raw.title, `${prefix}标题`);
  const startMinute = assertIntInRange(raw.startMinute, 0, 1439, `${prefix}开始分钟`);
  const endMinute = assertIntInRange(raw.endMinute, startMinute + 1, 1440, `${prefix}结束分钟`);
  const locked = assertBoolean(raw.locked, `${prefix}锁定标记`);
  const completed = assertBoolean(raw.completed, `${prefix}完成标记`);
  const creditedMinutes = assertIntInRange(raw.creditedMinutes, 0, 1440, `${prefix}已计入时长`);
  const reason = assertString(raw.reason, `${prefix}排程说明`);

  return {
    id,
    date,
    sourceType,
    sourceIds,
    title,
    startMinute,
    endMinute,
    locked,
    completed,
    creditedMinutes,
    reason,
  };
}

function validateDailyPlan(raw: unknown, dateKey: string): DailySchedulePlan {
  if (!isValidDateString(dateKey)) throw new Error(`日程键名不是合法日期：${dateKey}`);
  if (!isObject(raw)) throw new Error(`日程 ${dateKey} 格式无效。`);
  const date = assertString(raw.date, `日程 ${dateKey} 日期`);
  if (date !== dateKey) throw new Error(`日程日期字段 ${date} 与键名 ${dateKey} 不匹配。`);

  const generatedAt = assertNonEmptyString(raw.generatedAt, `日程 ${dateKey} 生成时间`);
  const mode = assertEnum(raw.mode, PLAN_MODE_SET, `日程 ${dateKey} 排程模式`);

  if (!Array.isArray(raw.blocks)) throw new Error(`日程 ${dateKey} 时间块列表必须是数组。`);
  const blocks = raw.blocks.map((block, index) => validateScheduledBlock(block, dateKey, index));

  if (!Array.isArray(raw.unscheduledTasks)) throw new Error(`日程 ${dateKey} 未排入列表必须是数组。`);
  const unscheduledTasks: UnscheduledTaskNote[] = raw.unscheduledTasks.map((entry, index) => {
    if (!isObject(entry)) throw new Error(`日程 ${dateKey} 未排入项[${index}]格式无效。`);
    return {
      taskType: assertEnum(entry.taskType, new Set<'main_task' | 'small_task'>(['main_task', 'small_task']), '未排入任务类型'),
      taskId: assertNonEmptyString(entry.taskId, '未排入任务 ID'),
      title: assertNonEmptyString(entry.title, '未排入任务标题'),
      reason: assertString(entry.reason, '未排入原因'),
    };
  });

  if (!Array.isArray(raw.warnings)) throw new Error(`日程 ${dateKey} 警告列表必须是数组。`);
  const warnings = raw.warnings.map((w, index) => assertString(w, `日程 ${dateKey} 警告[${index}]`));

  return { date, generatedAt, mode, blocks, unscheduledTasks, warnings };
}

export function validateNotebookData(raw: unknown): NotebookData {
  if (!isObject(raw) || raw.schemaVersion !== 1) {
    throw new Error('不支持这个记事本数据版本，原数据未修改。');
  }
  const updatedAt = assertNonEmptyString(raw.updatedAt, '数据更新时间');

  if (!Array.isArray(raw.routines)) throw new Error('固定日常 routines 必须是数组。');
  const routineIds = new Set<string>();
  const routines = raw.routines.map((item, index) => validateRoutineItem(item, index, routineIds));

  const phaseSpec = validatePhaseSpec(raw.phaseSpec);

  if (!Array.isArray(raw.mainTasks)) throw new Error('主体任务 mainTasks 必须是数组。');
  const mainIds = new Set<string>();
  const mainTasks = raw.mainTasks.map((item, index) => validateMainTask(item, index, mainIds));

  if (!Array.isArray(raw.smallTasks)) throw new Error('突发小事 smallTasks 必须是数组。');
  const smallIds = new Set<string>();
  const smallTasks = raw.smallTasks.map((item, index) => validateSmallTask(item, index, smallIds));

  if (!isObject(raw.schedulesByDate)) throw new Error('日程记录 schedulesByDate 必须是对象。');
  const schedulesByDate: Record<string, DailySchedulePlan> = {};
  for (const [dateKey, plan] of Object.entries(raw.schedulesByDate)) {
    schedulesByDate[dateKey] = validateDailyPlan(plan, dateKey);
  }

  return {
    schemaVersion: 1,
    updatedAt,
    routines,
    phaseSpec,
    mainTasks,
    smallTasks,
    schedulesByDate,
  };
}

export function parseNotebookJson(jsonText: string): NotebookData {
  if (typeof jsonText !== 'string') {
    throw new Error('记事本备份内容必须是文本字符串。');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('记事本 JSON 格式无效，无法解析。');
  }
  return validateNotebookData(parsed);
}
