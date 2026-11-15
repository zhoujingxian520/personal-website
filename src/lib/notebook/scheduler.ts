import type {
  DailySchedulePlan,
  MainTask,
  NotebookData,
  PriorityLevel,
  RoutineItem,
  ScheduledBlock,
  SmallTask,
  SmallTaskUrgency,
  TimeOfDay,
  UnscheduledTaskNote,
} from './types.ts';
import { formatMinutesToTime, parseTimeToMinutes } from './schema.ts';

export interface ScheduleOptions {
  targetDate: string;
  mode: 'full_day' | 'from_now';
  nowMinutes?: number;
  existingPlan?: DailySchedulePlan;
  generatedAt?: string;
}

interface Interval {
  start: number;
  end: number;
}

const PRIORITY_WEIGHT: Record<PriorityLevel, number> = {
  P0: 300,
  P1: 200,
  P2: 100,
};

const URGENCY_WEIGHT: Record<SmallTaskUrgency, number> = {
  today_must: 300,
  soon: 200,
  whenever: 100,
};

const PERIOD_LABELS: Record<Exclude<TimeOfDay, 'any'>, string> = {
  morning: '上午',
  afternoon: '下午',
  evening: '晚上',
};

function getDayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function diffDays(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split('-').map(Number);
  const [ty, tm, td] = toDate.split('-').map(Number);
  const fromMs = Date.UTC(fy, fm - 1, fd);
  const toMs = Date.UTC(ty, tm - 1, td);
  return Math.round((toMs - fromMs) / 86400000);
}

function isRoutineActiveOnDate(routine: RoutineItem, dayOfWeek: number): boolean {
  if (!routine.enabled) return false;
  if (routine.dayPattern === 'everyday') return true;
  if (routine.dayPattern === 'weekdays') return dayOfWeek >= 1 && dayOfWeek <= 5;
  if (routine.dayPattern === 'weekends') return dayOfWeek === 0 || dayOfWeek === 6;
  return Array.isArray(routine.customDays) && routine.customDays.includes(dayOfWeek);
}

function getMinutePeriod(minute: number): Exclude<TimeOfDay, 'any'> {
  if (minute < 720) return 'morning';
  if (minute < 1080) return 'afternoon';
  return 'evening';
}

function slotOverlapWithPeriod(slot: Interval, period: TimeOfDay): number {
  if (period === 'any') return slot.end - slot.start;
  const range: Interval =
    period === 'morning'
      ? { start: 0, end: 720 }
      : period === 'afternoon'
        ? { start: 720, end: 1080 }
        : { start: 1080, end: 1440 };
  const s = Math.max(slot.start, range.start);
  const e = Math.min(slot.end, range.end);
  return Math.max(0, e - s);
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Interval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    const last = merged[merged.length - 1];
    if (curr.start <= last.end) {
      last.end = Math.max(last.end, curr.end);
    } else {
      merged.push({ ...curr });
    }
  }
  return merged;
}

function computeFreeSlots(bounds: Interval, occupied: Interval[]): Interval[] {
  if (bounds.end <= bounds.start) return [];
  const clipped = occupied
    .map((item) => ({
      start: Math.max(bounds.start, item.start),
      end: Math.min(bounds.end, item.end),
    }))
    .filter((item) => item.end > item.start);

  const merged = mergeIntervals(clipped);
  const free: Interval[] = [];
  let cursor = bounds.start;
  for (const occ of merged) {
    if (occ.start > cursor) {
      free.push({ start: cursor, end: occ.start });
    }
    cursor = Math.max(cursor, occ.end);
  }
  if (cursor < bounds.end) {
    free.push({ start: cursor, end: bounds.end });
  }
  return free;
}

function subtractIntervalFromSlots(slots: Interval[], used: Interval): Interval[] {
  const next: Interval[] = [];
  for (const slot of slots) {
    if (used.end <= slot.start || used.start >= slot.end) {
      next.push(slot);
      continue;
    }
    if (used.start > slot.start) {
      next.push({ start: slot.start, end: used.start });
    }
    if (used.end < slot.end) {
      next.push({ start: used.end, end: slot.end });
    }
  }
  return next;
}

function alignUp5(minute: number): number {
  return Math.ceil(minute / 5) * 5;
}

function createBlockId(prefix: string, index: number): string {
  return `nb-block-${prefix}-${index}`;
}

export function generateDailySchedule(
  data: NotebookData,
  options: ScheduleOptions,
): DailySchedulePlan {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const { phaseSpec } = data;
  const warnings: string[] = [];
  const unscheduledTasks: UnscheduledTaskNote[] = [];

  const dayStartMin = parseTimeToMinutes(phaseSpec.dayStart);
  const dayEndMin = parseTimeToMinutes(phaseSpec.dayEnd);
  const cutoffMin = parseTimeToMinutes(phaseSpec.highFocusCutoffTime);

  const rawNow = options.nowMinutes ?? dayStartMin;
  const alignedNow = Math.min(dayEndMin, Math.max(dayStartMin, alignUp5(rawNow)));
  const effectiveStart = options.mode === 'from_now' ? alignedNow : dayStartMin;

  const dayOfWeek = getDayOfWeek(options.targetDate);
  const existingBlocks = options.existingPlan?.blocks ?? [];

  // 1. 铺设固定日常并检查重叠
  const activeRoutines = data.routines
    .filter((r) => isRoutineActiveOnDate(r, dayOfWeek))
    .map((r) => ({
      routine: r,
      start: parseTimeToMinutes(r.startTime),
      end: parseTimeToMinutes(r.endTime),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const routineBlocks: ScheduledBlock[] = [];
  for (let i = 0; i < activeRoutines.length; i++) {
    const curr = activeRoutines[i];
    if (i > 0 && curr.start < activeRoutines[i - 1].end) {
      const prev = activeRoutines[i - 1];
      warnings.push(
        `固定日常「${prev.routine.title}」（${prev.routine.startTime}-${prev.routine.endTime}）与「${curr.routine.title}」（${curr.routine.startTime}-${curr.routine.endTime}）时间重叠。`,
      );
    }
    const prevState = existingBlocks.find(
      (b) =>
        b.sourceType === 'routine' &&
        b.sourceIds[0] === curr.routine.id &&
        b.startMinute === curr.start &&
        b.endMinute === curr.end,
    );
    routineBlocks.push({
      id: prevState?.id ?? createBlockId(`r-${curr.routine.id}`, i + 1),
      date: options.targetDate,
      sourceType: 'routine',
      sourceIds: [curr.routine.id],
      title: curr.routine.title,
      startMinute: curr.start,
      endMinute: curr.end,
      locked: prevState?.locked ?? false,
      completed: prevState?.completed ?? false,
      creditedMinutes: prevState?.creditedMinutes ?? 0,
      reason: '每日固定日常安排',
    });
  }

  // 2. 保留已有计划中的锁定块、已完成块及 from_now 过去非日常块
  const preservedBlocks: ScheduledBlock[] = [];
  for (const block of existingBlocks) {
    if (block.sourceType === 'routine') continue;
    const keepForMode = options.mode === 'from_now' && block.endMinute <= alignedNow;
    if (block.locked || block.completed || keepForMode) {
      preservedBlocks.push({ ...block });
    }
  }

  // 检查保留块是否与当前日常冲突
  for (const pBlock of preservedBlocks) {
    for (const rBlock of routineBlocks) {
      if (pBlock.startMinute < rBlock.endMinute && pBlock.endMinute > rBlock.startMinute) {
        warnings.push(
          `保留时间块「${pBlock.title}」（${formatMinutesToTime(pBlock.startMinute)}-${formatMinutesToTime(pBlock.endMinute)}）与固定日常「${rBlock.title}」时间冲突。`,
        );
      }
    }
  }

  // 统计已保留的主体任务与突发小事
  const usedBlockIds = new Set<string>([
    ...routineBlocks.map((b) => b.id),
    ...preservedBlocks.map((b) => b.id),
  ]);
  let blockSeq = 1;
  const nextBlockId = (prefix: string): string => {
    let candidate = createBlockId(prefix, blockSeq++);
    while (usedBlockIds.has(candidate)) {
      candidate = createBlockId(prefix, blockSeq++);
    }
    usedBlockIds.add(candidate);
    return candidate;
  };
  const preservedMainTotalMinutes = new Map<string, number>();
  const preservedMainUncreditedMinutes = new Map<string, number>();
  let totalPreservedMainToday = 0;
  const preservedSmallIds = new Set<string>();

  for (const block of preservedBlocks) {
    const dur = block.endMinute - block.startMinute;
    if (block.sourceType === 'main_task') {
      totalPreservedMainToday += dur;
      for (const id of block.sourceIds) {
        preservedMainTotalMinutes.set(id, (preservedMainTotalMinutes.get(id) ?? 0) + dur);
        if (!block.completed) {
          const uncredited = Math.max(0, dur - block.creditedMinutes);
          preservedMainUncreditedMinutes.set(id, (preservedMainUncreditedMinutes.get(id) ?? 0) + uncredited);
        }
      }
    } else if (block.sourceType === 'small_task' || block.sourceType === 'errand_batch') {
      for (const id of block.sourceIds) {
        preservedSmallIds.add(id);
      }
    }
  }

  // 3. 计算有效空闲窗口
  const occupiedIntervals: Interval[] = [
    ...routineBlocks.map((b) => ({ start: b.startMinute, end: b.endMinute })),
    ...preservedBlocks.map((b) => ({ start: b.startMinute, end: b.endMinute })),
  ];
  let freeSlots = computeFreeSlots({ start: effectiveStart, end: dayEndMin }, occupiedIntervals);

  // 4. 筛选待排主体任务与突发小事
  const activeMainTasks = data.mainTasks.filter((t) => {
    if (t.status !== 'active') return false;
    const uncredited = preservedMainUncreditedMinutes.get(t.id) ?? 0;
    const remaining = t.totalEstimatedMinutes - t.completedMinutes - uncredited;
    return remaining > 0;
  });

  const pendingSmallTasks = data.smallTasks.filter((t) => {
    if (t.status !== 'pending') return false;
    if (preservedSmallIds.has(t.id)) return false;
    if (t.targetDate && t.targetDate > options.targetDate) return false;
    return true;
  });

  // 预留杂务缓冲（仅当自然短空隙不足时从非黄金时段的大块尾端预留）
  let reservedBufferSlot: Interval | null = null;
  if (phaseSpec.reserveErrandWindowMinutes > 0 && pendingSmallTasks.length > 0) {
    const naturalShortMinutes = freeSlots
      .filter((s) => s.end - s.start < phaseSpec.minMainTaskBlockMinutes)
      .reduce((sum, s) => sum + (s.end - s.start), 0);
    const totalPendingSmallMin = pendingSmallTasks.reduce((sum, s) => sum + s.estimatedMinutes, 0);
    const neededBuffer = Math.min(phaseSpec.reserveErrandWindowMinutes, totalPendingSmallMin);
    const deficit = neededBuffer - naturalShortMinutes;
    if (deficit > 0 && freeSlots.length > 0) {
      // 尽量从非深度工作偏好时段的大空隙尾部预留，避免切走黄金时段
      const candidateSlots = [...freeSlots]
        .filter((s) => s.end - s.start >= deficit + 15)
        .sort((a, b) => {
          const aPref = slotOverlapWithPeriod(a, phaseSpec.preferredDeepWorkPeriod) > 0 ? 1 : 0;
          const bPref = slotOverlapWithPeriod(b, phaseSpec.preferredDeepWorkPeriod) > 0 ? 1 : 0;
          if (aPref !== bPref) return aPref - bPref;
          return b.end - a.end;
        });
      const host = candidateSlots[0];
      if (host && host.end - host.start - deficit >= phaseSpec.minMainTaskBlockMinutes) {
        reservedBufferSlot = { start: host.end - deficit, end: host.end };
        freeSlots = subtractIntervalFromSlots(freeSlots, reservedBufferSlot);
      }
    }
  }

  // 5. 分配阶段主体任务（大块时间优先保护）
  const sortedMainTasks = [...activeMainTasks].sort((a, b) => {
    const score = (task: MainTask) => {
      let s = PRIORITY_WEIGHT[task.priority];
      if (task.deadline) {
        const left = diffDays(options.targetDate, task.deadline);
        if (left <= 0) s += 180;
        else if (left <= 2) s += 120;
        else if (left <= 7) s += 60;
      }
      if (task.preferredPeriod === phaseSpec.preferredDeepWorkPeriod) s += 20;
      return s;
    };
    return score(b) - score(a);
  });

  const plannedMainBlocks: ScheduledBlock[] = [];
  const plannedBreakBlocks: ScheduledBlock[] = [];
  let remainingDailyTarget = Math.max(0, phaseSpec.dailyMainTaskTargetMinutes - totalPreservedMainToday);

  for (const task of sortedMainTasks) {
    const preservedForTask = preservedMainTotalMinutes.get(task.id) ?? 0;
    const uncreditedForTask = preservedMainUncreditedMinutes.get(task.id) ?? 0;
    let remainingWork = Math.max(0, task.totalEstimatedMinutes - task.completedMinutes - uncreditedForTask);
    let taskQuotaLeft =
      task.dailyQuotaMinutes !== undefined
        ? Math.max(0, task.dailyQuotaMinutes - preservedForTask)
        : remainingDailyTarget;

    let scheduledForThisTask = 0;
    const baseMinBlock = Math.max(phaseSpec.minMainTaskBlockMinutes, task.minSessionMinutes ?? 0);

    while (remainingWork > 0 && taskQuotaLeft > 0 && remainingDailyTarget > 0) {
      const effectiveMin = Math.min(baseMinBlock, remainingWork);
      const minRequired = Math.max(15, effectiveMin);

      // 计算可用子窗口（考虑 highFocusCutoffTime）
      const candidates: Array<{ slot: Interval; usableEnd: number; score: number }> = [];
      for (const slot of freeSlots) {
        const usableEnd = Math.min(slot.end, cutoffMin);
        const usableLen = usableEnd - slot.start;
        if (usableLen < minRequired) continue;

        let score = 0;
        if (task.preferredPeriod !== 'any') {
          score += slotOverlapWithPeriod({ start: slot.start, end: usableEnd }, task.preferredPeriod) > 0 ? 120 : 0;
        }
        score += slotOverlapWithPeriod({ start: slot.start, end: usableEnd }, phaseSpec.preferredDeepWorkPeriod) > 0 ? 60 : 0;
        // 尽量选择刚好契合或不浪费更稀缺黄金大块的窗口
        score -= Math.floor(slot.start / 60);
        candidates.push({ slot, usableEnd, score });
      }

      if (candidates.length === 0) break;
      candidates.sort((a, b) => b.score - a.score || a.slot.start - b.slot.start);
      const chosen = candidates[0];
      const maxAllow = Math.min(
        phaseSpec.maxMainTaskBlockMinutes,
        taskQuotaLeft,
        remainingDailyTarget,
        remainingWork,
        chosen.usableEnd - chosen.slot.start,
      );
      if (maxAllow < minRequired) break;

      const blockStart = chosen.slot.start;
      const blockEnd = blockStart + maxAllow;
      const periodLabel = PERIOD_LABELS[getMinutePeriod(blockStart)];
      const reasonParts = [
        `${periodLabel}整块专注（${maxAllow} 分钟）`,
        `优先级 ${task.priority}`,
      ];
      if (task.preferredPeriod !== 'any' && getMinutePeriod(blockStart) === task.preferredPeriod) {
        reasonParts.push(`匹配偏好时段`);
      } else if (getMinutePeriod(blockStart) === phaseSpec.preferredDeepWorkPeriod) {
        reasonParts.push(`符合阶段深度工作时段`);
      }

      plannedMainBlocks.push({
        id: nextBlockId('m'),
        date: options.targetDate,
        sourceType: 'main_task',
        sourceIds: [task.id],
        title: task.title,
        startMinute: blockStart,
        endMinute: blockEnd,
        locked: false,
        completed: false,
        creditedMinutes: 0,
        reason: reasonParts.join(' · '),
      });

      freeSlots = subtractIntervalFromSlots(freeSlots, { start: blockStart, end: blockEnd });
      remainingWork -= maxAllow;
      taskQuotaLeft -= maxAllow;
      remainingDailyTarget -= maxAllow;
      scheduledForThisTask += maxAllow;

      // 若该空隙后续仍有足够空间且配置了休息间隔，插入休息缓冲
      const breakMin = phaseSpec.breakBetweenBlocksMinutes;
      if (breakMin > 0 && chosen.slot.end - blockEnd >= breakMin + 15) {
        const breakEnd = blockEnd + breakMin;
        plannedBreakBlocks.push({
          id: nextBlockId('brk'),
          date: options.targetDate,
          sourceType: 'break',
          sourceIds: [task.id],
          title: '专注后休息与调整',
          startMinute: blockEnd,
          endMinute: breakEnd,
          locked: false,
          completed: false,
          creditedMinutes: 0,
          reason: `连续专注 ${maxAllow} 分钟后插入 ${breakMin} 分钟休息`,
        });
        freeSlots = subtractIntervalFromSlots(freeSlots, { start: blockEnd, end: breakEnd });
      }
    }

    if (scheduledForThisTask === 0 && preservedForTask === 0) {
      const hasAnyPreCutoffSlot = freeSlots.some((s) => Math.min(s.end, cutoffMin) - s.start >= Math.min(baseMinBlock, remainingWork));
      let reason = '可用连续时段已被更高优先级主任务或日常安排占满';
      if (remainingDailyTarget <= 0) {
        reason = `已达到每日主体任务目标上限（${phaseSpec.dailyMainTaskTargetMinutes} 分钟）`;
      } else if (!hasAnyPreCutoffSlot) {
        reason = `高强度截止时间（${phaseSpec.highFocusCutoffTime}）前缺少 >= ${Math.min(baseMinBlock, remainingWork)} 分钟的连续整块时间`;
      }
      unscheduledTasks.push({
        taskType: 'main_task',
        taskId: task.id,
        title: task.title,
        reason,
      });
    }
  }

  // 把预留杂务缓冲放回 freeSlots，供突发小事使用
  if (reservedBufferSlot) {
    freeSlots = mergeIntervals([...freeSlots, reservedBufferSlot]);
  }

  // 6. 安排突发小事（短空隙优先 + 同场景合并批处理 + 大空隙贴边 + today_must 协商让位）
  const sortedSmallTasks = [...pendingSmallTasks].sort((a, b) => {
    const urgDiff = URGENCY_WEIGHT[b.urgency] - URGENCY_WEIGHT[a.urgency];
    if (urgDiff !== 0) return urgDiff;
    const aWindowed = a.timeWindowStart || a.timeWindowEnd ? 1 : 0;
    const bWindowed = b.timeWindowStart || b.timeWindowEnd ? 1 : 0;
    if (aWindowed !== bWindowed) return bWindowed - aWindowed;
    const aDue = a.targetDate ?? '9999-12-31';
    const bDue = b.targetDate ?? '9999-12-31';
    if (aDue !== bDue) return aDue.localeCompare(bDue);
    return a.estimatedMinutes - b.estimatedMinutes;
  });

  interface SmallWorkUnit {
    sourceType: 'small_task' | 'errand_batch';
    tasks: SmallTask[];
    title: string;
    duration: number;
    urgency: SmallTaskUrgency;
    preferredPeriod: TimeOfDay;
    windowStart: number;
    windowEnd: number;
    tagLabel?: string;
  }

  const workUnits: SmallWorkUnit[] = [];
  if (phaseSpec.batchSmallTasks) {
    const tagGroups = new Map<string, SmallTask[]>();
    const ungrouped: SmallTask[] = [];
    for (const task of sortedSmallTasks) {
      const tag = task.contextTag?.trim();
      const hasNarrowWindow = Boolean(task.timeWindowStart || task.timeWindowEnd);
      if (tag && !hasNarrowWindow) {
        const list = tagGroups.get(tag) ?? [];
        list.push(task);
        tagGroups.set(tag, list);
      } else {
        ungrouped.push(task);
      }
    }
    for (const [tag, group] of tagGroups.entries()) {
      if (group.length >= 2) {
        const totalMin = group.reduce((sum, t) => sum + t.estimatedMinutes, 0);
        if (totalMin <= 90) {
          const topUrgency = group.some((t) => t.urgency === 'today_must')
            ? 'today_must'
            : group.some((t) => t.urgency === 'soon')
              ? 'soon'
              : 'whenever';
          workUnits.push({
            sourceType: 'errand_batch',
            tasks: group,
            title: `${tag} 集中处理（${group.map((t) => t.title).join(' / ')}）`,
            duration: totalMin,
            urgency: topUrgency,
            preferredPeriod: group[0].preferredPeriod,
            windowStart: effectiveStart,
            windowEnd: dayEndMin,
            tagLabel: tag,
          });
          continue;
        }
      }
      ungrouped.push(...group);
    }
    for (const task of ungrouped) {
      workUnits.push({
        sourceType: 'small_task',
        tasks: [task],
        title: task.title,
        duration: task.estimatedMinutes,
        urgency: task.urgency,
        preferredPeriod: task.preferredPeriod,
        windowStart: task.timeWindowStart ? parseTimeToMinutes(task.timeWindowStart) : effectiveStart,
        windowEnd: task.timeWindowEnd ? parseTimeToMinutes(task.timeWindowEnd) : dayEndMin,
      });
    }
  } else {
    for (const task of sortedSmallTasks) {
      workUnits.push({
        sourceType: 'small_task',
        tasks: [task],
        title: task.title,
        duration: task.estimatedMinutes,
        urgency: task.urgency,
        preferredPeriod: task.preferredPeriod,
        windowStart: task.timeWindowStart ? parseTimeToMinutes(task.timeWindowStart) : effectiveStart,
        windowEnd: task.timeWindowEnd ? parseTimeToMinutes(task.timeWindowEnd) : dayEndMin,
      });
    }
  }

  workUnits.sort((a, b) => URGENCY_WEIGHT[b.urgency] - URGENCY_WEIGHT[a.urgency]);

  const plannedSmallBlocks: ScheduledBlock[] = [];

  function tryPlaceUnitInFreeSlots(unit: SmallWorkUnit): boolean {
    const candidates: Array<{
      slot: Interval;
      placeStart: number;
      placeEnd: number;
      tierScore: number;
      isFragment: boolean;
    }> = [];

    for (const slot of freeSlots) {
      const wStart = Math.max(slot.start, unit.windowStart);
      const wEnd = Math.min(slot.end, unit.windowEnd);
      if (wEnd - wStart < unit.duration) continue;

      const slotLen = slot.end - slot.start;
      const isFragment = slotLen < phaseSpec.minMainTaskBlockMinutes;
      // 优先填入天然短空隙，其次贴大空隙边缘（尽量靠尾部，或偏好时段匹配的头部）
      const preferHead =
        unit.preferredPeriod !== 'any' && getMinutePeriod(wStart) === unit.preferredPeriod;
      const placeStart = isFragment || preferHead ? wStart : wEnd - unit.duration;
      const placeEnd = placeStart + unit.duration;

      let tierScore = isFragment ? 200 : 50;
      if (unit.preferredPeriod !== 'any' && getMinutePeriod(placeStart) === unit.preferredPeriod) {
        tierScore += 40;
      }
      // 碎片越贴近所需时长越优
      tierScore -= Math.floor((slotLen - unit.duration) / 10);

      candidates.push({ slot, placeStart, placeEnd, tierScore, isFragment });
    }

    if (candidates.length === 0) return false;
    candidates.sort((a, b) => b.tierScore - a.tierScore || a.placeStart - b.placeStart);
    const chosen = candidates[0];

    const reason =
      unit.sourceType === 'errand_batch'
        ? `同场景 ${unit.tagLabel} 合并批处理 · ${chosen.isFragment ? '利用短空隙' : '贴近空闲边缘放置'}`
        : chosen.isFragment
          ? '利用固定日常间短空隙处理，不打断主体任务整块时间'
          : '贴近空闲时段边缘安排突发小事，保持主干时间整洁';

    plannedSmallBlocks.push({
      id: nextBlockId(unit.sourceType === 'errand_batch' ? 'b' : 's'),
      date: options.targetDate,
      sourceType: unit.sourceType,
      sourceIds: unit.tasks.map((t) => t.id),
      title: unit.title,
      startMinute: chosen.placeStart,
      endMinute: chosen.placeEnd,
      locked: false,
      completed: false,
      creditedMinutes: 0,
      reason,
    });
    freeSlots = subtractIntervalFromSlots(freeSlots, {
      start: chosen.placeStart,
      end: chosen.placeEnd,
    });
    return true;
  }

  function tryPreemptMainTask(unit: SmallWorkUnit): boolean {
    if (unit.urgency !== 'today_must') return false;
    // 优先从最低优先级、最晚开始的未锁定主任务块尾部让出时间；若剩余不足 30m 则整体让位
    const taskPriorityMap = new Map(data.mainTasks.map((t) => [t.id, PRIORITY_WEIGHT[t.priority]]));
    const candidates = plannedMainBlocks
      .map((block, idx) => {
        const blockDur = block.endMinute - block.startMinute;
        const wStart = Math.max(block.startMinute, unit.windowStart);
        const wEnd = Math.min(block.endMinute, unit.windowEnd);
        const canPartial = blockDur - unit.duration >= 30;
        return {
          block,
          idx,
          priority: taskPriorityMap.get(block.sourceIds[0]) ?? 200,
          canPartial,
          fits: !block.locked && !block.completed && wEnd - wStart >= unit.duration,
        };
      })
      .filter((item) => item.fits)
      .sort(
        (a, b) =>
          Number(b.canPartial) - Number(a.canPartial) ||
          a.priority - b.priority ||
          b.block.startMinute - a.block.startMinute,
      );

    if (candidates.length === 0) return false;
    const chosen = candidates[0];
    const host = chosen.block;
    const wEnd = Math.min(host.endMinute, unit.windowEnd);
    const placeEnd = wEnd;
    const placeStart = placeEnd - unit.duration;

    if (!chosen.canPartial) {
      // 整体让出该未锁定主任务块，把未占用的剩余边角归还空闲池
      plannedMainBlocks.splice(chosen.idx, 1);
      if (placeStart > host.startMinute) {
        freeSlots = mergeIntervals([...freeSlots, { start: host.startMinute, end: placeStart }]);
      }
      if (placeEnd < host.endMinute) {
        freeSlots = mergeIntervals([...freeSlots, { start: placeEnd, end: host.endMinute }]);
      }
      const hostTaskId = host.sourceIds[0];
      const stillHasOtherBlock =
        plannedMainBlocks.some((b) => b.sourceIds.includes(hostTaskId)) ||
        (preservedMainTotalMinutes.get(hostTaskId) ?? 0) > 0;
      if (!stillHasOtherBlock) {
        unscheduledTasks.push({
          taskType: 'main_task',
          taskId: hostTaskId,
          title: host.title,
          reason: `为优先安排今日必做突发小事「${unit.title}」而让出今日时段`,
        });
      }
      plannedSmallBlocks.push({
        id: nextBlockId('s'),
        date: options.targetDate,
        sourceType: unit.sourceType,
        sourceIds: unit.tasks.map((t) => t.id),
        title: unit.title,
        startMinute: placeStart,
        endMinute: placeEnd,
        locked: false,
        completed: false,
        creditedMinutes: 0,
        reason: `今日必做紧急插空（替换原「${host.title}」时段）`,
      });
      warnings.push(
        `为安排今日必做突发小事「${unit.title}」（${unit.duration} 分钟），原定主体任务「${host.title}」时段已让位。`,
      );
      return true;
    }

    // 尽量从主机块尾部让出，避免把主机块劈成两半
    if (placeEnd === host.endMinute) {
      host.endMinute = placeStart;
    } else if (placeStart === host.startMinute) {
      host.startMinute = placeEnd;
    } else {
      // 窗口强制落在中间时，仅保留较长的一侧给主任务，避免过度碎裂
      const leftLen = placeStart - host.startMinute;
      const rightLen = host.endMinute - placeEnd;
      if (leftLen >= rightLen && leftLen >= 30) {
        freeSlots = mergeIntervals([...freeSlots, { start: placeEnd, end: host.endMinute }]);
        host.endMinute = placeStart;
      } else if (rightLen >= 30) {
        freeSlots = mergeIntervals([...freeSlots, { start: host.startMinute, end: placeStart }]);
        host.startMinute = placeEnd;
      } else {
        return false;
      }
    }

    host.reason = `${host.reason}（为今日必做小事「${unit.title}」让出 ${unit.duration} 分钟）`;
    plannedSmallBlocks.push({
      id: nextBlockId('s'),
      date: options.targetDate,
      sourceType: unit.sourceType,
      sourceIds: unit.tasks.map((t) => t.id),
      title: unit.title,
      startMinute: placeStart,
      endMinute: placeEnd,
      locked: false,
      completed: false,
      creditedMinutes: 0,
      reason: `今日必做紧急插空（从「${host.title}」末尾协调 ${unit.duration} 分钟）`,
    });
    warnings.push(
      `为安排今日必做突发小事「${unit.title}」（${unit.duration} 分钟），主体任务「${host.title}」已压缩让位。`,
    );
    return true;
  }

  const failedBatches: SmallTask[] = [];
  for (const unit of workUnits) {
    if (tryPlaceUnitInFreeSlots(unit)) continue;
    if (unit.sourceType === 'errand_batch') {
      // 批处理整块放不下时拆回单条小事再尝试插空
      failedBatches.push(...unit.tasks);
      continue;
    }
    if (tryPreemptMainTask(unit)) continue;

    for (const task of unit.tasks) {
      const hasWindow = Boolean(task.timeWindowStart || task.timeWindowEnd);
      unscheduledTasks.push({
        taskType: 'small_task',
        taskId: task.id,
        title: task.title,
        reason: hasWindow
          ? `指定时间窗（${task.timeWindowStart ?? phaseSpec.dayStart}-${task.timeWindowEnd ?? phaseSpec.dayEnd}）内缺少足够 ${task.estimatedMinutes} 分钟的空隙`
          : `今日剩余空闲时段不足 ${task.estimatedMinutes} 分钟`,
      });
    }
  }

  for (const task of failedBatches) {
    const unit: SmallWorkUnit = {
      sourceType: 'small_task',
      tasks: [task],
      title: task.title,
      duration: task.estimatedMinutes,
      urgency: task.urgency,
      preferredPeriod: task.preferredPeriod,
      windowStart: task.timeWindowStart ? parseTimeToMinutes(task.timeWindowStart) : effectiveStart,
      windowEnd: task.timeWindowEnd ? parseTimeToMinutes(task.timeWindowEnd) : dayEndMin,
    };
    if (tryPlaceUnitInFreeSlots(unit)) continue;
    if (tryPreemptMainTask(unit)) continue;
    unscheduledTasks.push({
      taskType: 'small_task',
      taskId: task.id,
      title: task.title,
      reason: `今日剩余空闲时段不足 ${task.estimatedMinutes} 分钟`,
    });
  }

  // 清理多余尾部休息块（仅保留后面确实还有紧邻日程块的休息块）
  const scheduledWorkBlocks = [
    ...routineBlocks,
    ...preservedBlocks,
    ...plannedMainBlocks,
    ...plannedSmallBlocks,
  ];
  const validBreakBlocks = plannedBreakBlocks.filter((brk) =>
    scheduledWorkBlocks.some((other) => other.startMinute === brk.endMinute),
  );

  const allBlocks = [...scheduledWorkBlocks, ...validBreakBlocks].sort(
    (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute,
  );

  return {
    date: options.targetDate,
    generatedAt,
    mode: options.mode,
    blocks: allBlocks,
    unscheduledTasks,
    warnings,
  };
}
