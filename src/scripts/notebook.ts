import type {
  DailySchedulePlan,
  DayPattern,
  MainTask,
  NotebookData,
  PriorityLevel,
  RoutineCategory,
  RoutineItem,
  ScheduledBlock,
  SmallTask,
  SmallTaskUrgency,
  TimeOfDay,
} from '../lib/notebook/types.ts';
import {
  createEmptyNotebookData,
  createNotebookId,
  formatMinutesToTime,
  parseTimeToMinutes,
} from '../lib/notebook/schema.ts';
import { NotebookStore } from '../lib/notebook/storage.ts';
import { generateDailySchedule } from '../lib/notebook/scheduler.ts';
import {
  exportBackupJson,
  exportNotebookMarkdown,
  mergeBackupData,
  previewBackupImport,
  type BackupImportPreview,
} from '../lib/notebook/backup.ts';

function getLocalDateString(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysToDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

function getCurrentMinutesOfDay(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function mustEl<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`找不到页面元素：${selector}`);
  return node;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const SOURCE_LABELS: Record<ScheduledBlock['sourceType'], string> = {
  routine: '固定日常',
  main_task: '主体任务',
  small_task: '突发小事',
  errand_batch: '杂务批处理',
  break: '休息调整',
};

const URGENCY_LABELS: Record<SmallTaskUrgency, string> = {
  today_must: '今天必做',
  soon: '近期优先',
  whenever: '顺手安排',
};

const PERIOD_LABELS: Record<TimeOfDay, string> = {
  morning: '上午',
  afternoon: '下午',
  evening: '晚上',
  any: '任意时段',
};

const PATTERN_LABELS: Record<DayPattern, string> = {
  everyday: '每天',
  weekdays: '工作日',
  weekends: '周末',
  custom: '自定义星期',
};

const CATEGORY_LABELS: Record<RoutineCategory, string> = {
  sleep: '作息',
  meal: '饮食',
  work: '工作',
  study: '学习',
  exercise: '运动',
  commute: '通勤',
  other: '其他',
};

function initNotebook(): void {
  const appRoot = document.querySelector<HTMLElement>('#nb-app');
  if (!appRoot) return;

  const store = new NotebookStore();
  let selectedDate = getLocalDateString(0);
  let activeTab: 'small' | 'phase' | 'routine' = 'small';
  let pendingPreview: BackupImportPreview | null = null;
  let preImportSnapshot: NotebookData | null = null;
  let clearArmed = false;
  let toastTimer: number | undefined;

  const targetDateInput = mustEl<HTMLInputElement>('#nb-target-date');
  const saveBadge = mustEl<HTMLElement>('#nb-save-badge');
  const saveText = mustEl<HTMLElement>('#nb-save-text');
  const phaseSummary = mustEl<HTMLElement>('#nb-phase-summary');
  const planMeta = mustEl<HTMLElement>('#nb-plan-meta');
  const statsBar = mustEl<HTMLElement>('#nb-stats-bar');
  const warningsBox = mustEl<HTMLElement>('#nb-warnings');
  const timelineList = mustEl<HTMLElement>('#nb-timeline-list');
  const unscheduledBox = mustEl<HTMLElement>('#nb-unscheduled');
  const toastEl = mustEl<HTMLElement>('#nb-toast');

  const quickForm = mustEl<HTMLFormElement>('#nb-quick-form');
  const quickTitle = mustEl<HTMLInputElement>('#nb-quick-title');
  const quickDuration = mustEl<HTMLInputElement>('#nb-quick-duration');
  const quickUrgency = mustEl<HTMLSelectElement>('#nb-quick-urgency');
  const quickPeriod = mustEl<HTMLSelectElement>('#nb-quick-period');
  const quickTag = mustEl<HTMLInputElement>('#nb-quick-tag');
  const quickWinStart = mustEl<HTMLInputElement>('#nb-quick-win-start');
  const quickWinEnd = mustEl<HTMLInputElement>('#nb-quick-win-end');

  const phaseForm = mustEl<HTMLFormElement>('#nb-phase-form');
  const mainForm = mustEl<HTMLFormElement>('#nb-main-form');
  const routineForm = mustEl<HTMLFormElement>('#nb-routine-form');
  const routinePattern = mustEl<HTMLSelectElement>('#nb-routine-pattern');
  const customDaysBox = mustEl<HTMLElement>('#nb-routine-custom-days');

  const backupDialog = mustEl<HTMLDialogElement>('#nb-backup-dialog');
  const mdPreview = mustEl<HTMLTextAreaElement>('#nb-md-preview');
  const importFile = mustEl<HTMLInputElement>('#nb-import-file');
  const importText = mustEl<HTMLTextAreaElement>('#nb-import-text');
  const importPreviewBox = mustEl<HTMLElement>('#nb-import-preview-box');
  const importOptionsBox = mustEl<HTMLElement>('#nb-import-options');
  const importUndoBtn = mustEl<HTMLButtonElement>('#nb-import-undo-btn');
  const clearAllBtn = mustEl<HTMLButtonElement>('#nb-clear-all-btn');

  targetDateInput.value = selectedDate;

  function showToast(message: string): void {
    toastEl.textContent = message;
    toastEl.hidden = false;
    if (toastTimer !== undefined) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.hidden = true;
    }, 3200);
  }

  function updateSaveStatus(persisted: boolean): void {
    const nowTime = new Date().toTimeString().slice(0, 8);
    if (!store.persistent || !persisted) {
      saveBadge.classList.add('is-warn');
      saveText.textContent = store.issue || '仅会话保存（未能写入本地存储），请及时导出 JSON 备份';
    } else {
      saveBadge.classList.remove('is-warn');
      saveText.textContent = `已自动本地保存 · ${nowTime}`;
    }
  }

  function commitData(
    mutator: (draft: NotebookData) => void,
    message?: string,
  ): boolean {
    const draft: NotebookData = JSON.parse(JSON.stringify(store.data)) as NotebookData;
    mutator(draft);
    draft.updatedAt = new Date().toISOString();
    try {
      const persisted = store.save(draft);
      updateSaveStatus(persisted);
      renderAll();
      if (message) showToast(message);
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : '数据校验失败，未保存修改');
      return false;
    }
  }

  function getSelectedPlan(): DailySchedulePlan | undefined {
    return store.data.schedulesByDate[selectedDate];
  }

  function renderHeaderAndPhaseForm(): void {
    const { phaseSpec, smallTasks, mainTasks, routines } = store.data;
    phaseSummary.textContent = phaseSpec.phaseTitle
      ? `当前阶段：${phaseSpec.phaseTitle}（${phaseSpec.startDate} ~ ${phaseSpec.endDate}）`
      : `默认阶段周期：${phaseSpec.startDate} ~ ${phaseSpec.endDate}`;

    mustEl<HTMLElement>('#nb-count-small').textContent =
      `(${smallTasks.filter((t) => t.status === 'pending').length})`;
    mustEl<HTMLElement>('#nb-count-main').textContent =
      `(${mainTasks.filter((t) => t.status === 'active').length})`;
    mustEl<HTMLElement>('#nb-count-routine').textContent = `(${routines.length})`;

    mustEl<HTMLInputElement>('#nb-phase-title').value = phaseSpec.phaseTitle;
    mustEl<HTMLInputElement>('#nb-phase-start').value = phaseSpec.startDate;
    mustEl<HTMLInputElement>('#nb-phase-end').value = phaseSpec.endDate;
    mustEl<HTMLInputElement>('#nb-day-start').value = phaseSpec.dayStart;
    mustEl<HTMLInputElement>('#nb-day-end').value = phaseSpec.dayEnd;
    mustEl<HTMLInputElement>('#nb-cutoff-time').value = phaseSpec.highFocusCutoffTime;
    mustEl<HTMLSelectElement>('#nb-deep-period').value = phaseSpec.preferredDeepWorkPeriod;
    mustEl<HTMLInputElement>('#nb-min-block').value = String(phaseSpec.minMainTaskBlockMinutes);
    mustEl<HTMLInputElement>('#nb-max-block').value = String(phaseSpec.maxMainTaskBlockMinutes);
    mustEl<HTMLInputElement>('#nb-break-min').value = String(phaseSpec.breakBetweenBlocksMinutes);
    mustEl<HTMLInputElement>('#nb-daily-target').value = String(phaseSpec.dailyMainTaskTargetMinutes);
    mustEl<HTMLInputElement>('#nb-errand-reserve').value = String(phaseSpec.reserveErrandWindowMinutes);
    mustEl<HTMLInputElement>('#nb-batch-small').checked = phaseSpec.batchSmallTasks;
    mustEl<HTMLTextAreaElement>('#nb-phase-note').value = phaseSpec.guidelineNote;
  }

  function renderSmallTaskList(): void {
    const container = mustEl<HTMLElement>('#nb-small-list');
    container.replaceChildren();
    const tasks = [...store.data.smallTasks].sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

    if (tasks.length === 0) {
      container.append(el('p', 'empty-message', '暂无突发小事，在上方速记栏随时加入。'));
      return;
    }

    for (const task of tasks) {
      const card = el('article', `nb-item${task.status !== 'pending' ? ' is-muted' : ''}`);
      const head = el('div', 'nb-item-head');
      head.append(el('span', 'nb-item-title', task.title));
      const tagClass = task.urgency === 'today_must' ? 'nb-tag nb-tag-urgent' : 'nb-tag';
      head.append(el('span', tagClass, URGENCY_LABELS[task.urgency]));

      const meta = el('div', 'nb-item-meta');
      meta.append(el('span', undefined, `约 ${task.estimatedMinutes} 分钟`));
      meta.append(el('span', undefined, `· ${PERIOD_LABELS[task.preferredPeriod]}`));
      if (task.contextTag) meta.append(el('span', 'nb-tag', task.contextTag));
      if (task.timeWindowStart || task.timeWindowEnd) {
        meta.append(
          el(
            'span',
            undefined,
            `· 窗口 ${task.timeWindowStart ?? store.data.phaseSpec.dayStart}-${task.timeWindowEnd ?? store.data.phaseSpec.dayEnd}`,
          ),
        );
      }

      const actions = el('div', 'nb-item-actions');
      const toggleBtn = el(
        'button',
        'nb-btn nb-btn-subtle',
        task.status === 'done' ? '恢复待办' : '标为完成',
      );
      toggleBtn.type = 'button';
      toggleBtn.addEventListener('click', () => {
        commitData((draft) => {
          const target = draft.smallTasks.find((t) => t.id === task.id);
          if (target) {
            target.status = target.status === 'done' ? 'pending' : 'done';
            target.updatedAt = new Date().toISOString();
          }
        });
      });

      const delBtn = el('button', 'nb-btn nb-btn-subtle nb-btn-danger', '删除');
      delBtn.type = 'button';
      delBtn.addEventListener('click', () => {
        commitData((draft) => {
          draft.smallTasks = draft.smallTasks.filter((t) => t.id !== task.id);
        }, '已删除突发小事');
      });

      actions.append(toggleBtn, delBtn);
      card.append(head, meta, actions);
      container.append(card);
    }
  }

  function renderMainTaskList(): void {
    const container = mustEl<HTMLElement>('#nb-main-list');
    container.replaceChildren();
    const tasks = store.data.mainTasks;
    if (tasks.length === 0) {
      container.append(el('p', 'empty-message', '还没有阶段主体任务，在上方表单添加。'));
      return;
    }

    for (const task of tasks) {
      const card = el('article', `nb-item${task.status !== 'active' ? ' is-muted' : ''}`);
      const head = el('div', 'nb-item-head');
      head.append(el('span', 'nb-item-title', task.title));
      const priClass =
        task.priority === 'P0'
          ? 'nb-tag nb-tag-p0'
          : task.priority === 'P1'
            ? 'nb-tag nb-tag-p1'
            : 'nb-tag';
      head.append(el('span', priClass, `${task.priority} · ${task.status === 'active' ? '推进中' : task.status === 'paused' ? '已暂停' : '已完成'}`));

      const pct = Math.min(100, Math.round((task.completedMinutes / task.totalEstimatedMinutes) * 100));
      const meta = el('div', 'nb-item-meta');
      meta.append(
        el(
          'span',
          undefined,
          `累计 ${task.completedMinutes} / ${task.totalEstimatedMinutes} 分钟（${pct}%）`,
        ),
      );
      meta.append(el('span', undefined, `· ${PERIOD_LABELS[task.preferredPeriod]}`));
      if (task.deadline) meta.append(el('span', undefined, `· 截止 ${task.deadline}`));

      const track = el('div', 'nb-progress-track');
      const fill = el('div', 'nb-progress-fill');
      fill.style.width = `${pct}%`;
      track.append(fill);

      const actions = el('div', 'nb-item-actions');
      const add30 = el('button', 'nb-btn nb-btn-subtle', '+30m');
      add30.type = 'button';
      add30.addEventListener('click', () => {
        commitData((draft) => {
          const t = draft.mainTasks.find((item) => item.id === task.id);
          if (!t) return;
          t.completedMinutes += 30;
          if (t.completedMinutes >= t.totalEstimatedMinutes) t.status = 'completed';
          t.updatedAt = new Date().toISOString();
        });
      });

      const statusBtn = el(
        'button',
        'nb-btn nb-btn-subtle',
        task.status === 'active' ? '暂停' : '恢复推进',
      );
      statusBtn.type = 'button';
      statusBtn.addEventListener('click', () => {
        commitData((draft) => {
          const t = draft.mainTasks.find((item) => item.id === task.id);
          if (!t) return;
          t.status = t.status === 'active' ? 'paused' : 'active';
          t.updatedAt = new Date().toISOString();
        });
      });

      const delBtn = el('button', 'nb-btn nb-btn-subtle nb-btn-danger', '删除');
      delBtn.type = 'button';
      delBtn.addEventListener('click', () => {
        commitData((draft) => {
          draft.mainTasks = draft.mainTasks.filter((item) => item.id !== task.id);
        }, '已删除主体任务');
      });

      actions.append(add30, statusBtn, delBtn);
      card.append(head, meta, track, actions);
      container.append(card);
    }
  }

  function renderRoutineList(): void {
    const container = mustEl<HTMLElement>('#nb-routine-list');
    container.replaceChildren();
    const routines = [...store.data.routines].sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (routines.length === 0) {
      container.append(el('p', 'empty-message', '暂无固定日常，添加每天不变的作息与固定事务。'));
      return;
    }

    for (const item of routines) {
      const card = el('article', `nb-item${!item.enabled ? ' is-muted' : ''}`);
      const head = el('div', 'nb-item-head');
      head.append(el('span', 'nb-item-title', `${item.startTime}–${item.endTime} ${item.title}`));
      head.append(el('span', 'nb-tag', CATEGORY_LABELS[item.category]));

      const meta = el('div', 'nb-item-meta');
      const customLabel =
        item.dayPattern === 'custom' && item.customDays?.length
          ? `（周${item.customDays.map((d) => ['日', '一', '二', '三', '四', '五', '六'][d]).join('、')}）`
          : '';
      meta.append(el('span', undefined, `${PATTERN_LABELS[item.dayPattern]}${customLabel}`));

      const actions = el('div', 'nb-item-actions');
      const toggleBtn = el('button', 'nb-btn nb-btn-subtle', item.enabled ? '停用' : '启用');
      toggleBtn.type = 'button';
      toggleBtn.addEventListener('click', () => {
        commitData((draft) => {
          const target = draft.routines.find((r) => r.id === item.id);
          if (target) {
            target.enabled = !target.enabled;
            target.updatedAt = new Date().toISOString();
          }
        });
      });

      const delBtn = el('button', 'nb-btn nb-btn-subtle nb-btn-danger', '删除');
      delBtn.type = 'button';
      delBtn.addEventListener('click', () => {
        commitData((draft) => {
          draft.routines = draft.routines.filter((r) => r.id !== item.id);
        }, '已删除固定日常');
      });

      actions.append(toggleBtn, delBtn);
      card.append(head, meta, actions);
      container.append(card);
    }
  }

  function renderTimeline(): void {
    const plan = getSelectedPlan();
    statsBar.replaceChildren();
    warningsBox.replaceChildren();
    timelineList.replaceChildren();
    unscheduledBox.replaceChildren();

    if (!plan) {
      planMeta.textContent = `${selectedDate} · 尚未生成`;
      unscheduledBox.hidden = true;

      const empty = el('div', 'nb-empty-state');
      empty.append(el('h3', undefined, `尚未生成 ${selectedDate} 的时间规划`));
      empty.append(
        el(
          'p',
          undefined,
          '在左侧补充你的固定日常、阶段主体任务与突发小事，然后点击下方按钮由本地排程引擎自动生成时间轴；也可以先载入一份示例模板快速体验。',
        ),
      );
      const btnRow = el('div', 'nb-toolbar');
      btnRow.style.justifyContent = 'center';
      const genBtn = el('button', 'nb-btn nb-btn-primary', '立即生成今日规划');
      genBtn.type = 'button';
      genBtn.addEventListener('click', () => runScheduler('full_day'));

      const demoBtn = el('button', 'nb-btn', '载入示例模板并预览');
      demoBtn.type = 'button';
      demoBtn.addEventListener('click', loadDemoTemplate);

      btnRow.append(genBtn, demoBtn);
      empty.append(btnRow);
      timelineList.append(empty);
      return;
    }

    planMeta.textContent = `${selectedDate} · ${plan.mode === 'from_now' ? '从当前时刻重排' : '全天规划'}`;

    let routineMin = 0;
    let mainMin = 0;
    let smallMin = 0;
    for (const block of plan.blocks) {
      const dur = block.endMinute - block.startMinute;
      if (block.sourceType === 'routine') routineMin += dur;
      else if (block.sourceType === 'main_task') mainMin += dur;
      else if (block.sourceType === 'small_task' || block.sourceType === 'errand_batch') smallMin += dur;
    }
    const daySpan =
      parseTimeToMinutes(store.data.phaseSpec.dayEnd) -
      parseTimeToMinutes(store.data.phaseSpec.dayStart);
    const freeMin = Math.max(0, daySpan - routineMin - mainMin - smallMin);

    const stats: Array<[string, string]> = [
      ['固定日常', formatDuration(routineMin)],
      ['主体任务投入', formatDuration(mainMin)],
      ['突发小事处理', formatDuration(smallMin)],
      ['剩余缓冲/自由', formatDuration(freeMin)],
    ];
    for (const [label, value] of stats) {
      const box = el('div', 'nb-stat-box');
      box.append(el('span', 'nb-stat-label', label), el('strong', 'nb-stat-value', value));
      statsBar.append(box);
    }

    for (const warning of plan.warnings) {
      warningsBox.append(el('div', 'nb-warning-box', warning));
    }

    if (plan.blocks.length === 0) {
      timelineList.append(el('p', 'empty-message', '当日暂无可排入时间块，请先添加日常或任务。'));
    } else {
      for (const block of plan.blocks) {
        const card = el('article', `nb-block${block.completed ? ' is-completed' : ''}`);
        card.dataset.source = block.sourceType;

        const timeCol = el('div', 'nb-block-time');
        timeCol.append(
          el('strong', undefined, `${formatMinutesToTime(block.startMinute)}`),
          el('span', undefined, `至 ${formatMinutesToTime(block.endMinute)}`),
          el('span', undefined, formatDuration(block.endMinute - block.startMinute)),
        );

        const body = el('div', 'nb-block-body');
        const top = el('div', 'nb-block-top');
        const titleWrap = el('div', 'nb-block-title-wrap');
        titleWrap.append(
          el('span', 'nb-tag', SOURCE_LABELS[block.sourceType]),
          el('span', 'nb-block-title', block.title),
        );
        if (block.locked) {
          titleWrap.append(el('span', 'nb-tag', '已锁定'));
        }

        const controls = el('div', 'nb-block-controls');
        if (block.sourceType !== 'break') {
          const checkLabel = el('label', 'nb-check-label');
          const checkbox = el('input');
          checkbox.type = 'checkbox';
          checkbox.checked = block.completed;
          checkbox.addEventListener('change', () => toggleBlockCompleted(block.id));
          checkLabel.append(checkbox, el('span', undefined, '完成'));
          controls.append(checkLabel);
        }

        const lockBtn = el('button', 'nb-btn nb-btn-subtle', block.locked ? '解锁' : '锁定');
        lockBtn.type = 'button';
        lockBtn.addEventListener('click', () => toggleBlockLocked(block.id));

        const earlierBtn = el('button', 'nb-btn nb-btn-subtle', '-15m');
        earlierBtn.type = 'button';
        earlierBtn.title = '提前 15 分钟';
        earlierBtn.addEventListener('click', () => shiftBlock(block.id, -15));

        const laterBtn = el('button', 'nb-btn nb-btn-subtle', '+15m');
        laterBtn.type = 'button';
        laterBtn.title = '延后 15 分钟';
        laterBtn.addEventListener('click', () => shiftBlock(block.id, 15));

        const removeBtn = el('button', 'nb-btn nb-btn-subtle nb-btn-danger', '移除');
        removeBtn.type = 'button';
        removeBtn.addEventListener('click', () => removeBlock(block.id));

        controls.append(lockBtn, earlierBtn, laterBtn, removeBtn);
        top.append(titleWrap, controls);

        const reason = el('p', 'nb-block-reason', block.reason);
        body.append(top, reason);
        card.append(timeCol, body);
        timelineList.append(card);
      }
    }

    if (plan.unscheduledTasks.length > 0) {
      unscheduledBox.hidden = false;
      unscheduledBox.append(el('h3', undefined, '今日暂未排入的任务（建议调整时长或明日处理）'));
      const list = el('div', 'nb-list');
      for (const item of plan.unscheduledTasks) {
        const row = el('div', 'nb-item');
        row.append(
          el('div', 'nb-item-title', item.title),
          el('div', 'nb-item-meta', item.reason),
        );
        list.append(row);
      }
      unscheduledBox.append(list);
    } else {
      unscheduledBox.hidden = true;
    }
  }

  function renderAll(): void {
    renderHeaderAndPhaseForm();
    renderSmallTaskList();
    renderMainTaskList();
    renderRoutineList();
    renderTimeline();
  }

  function runScheduler(mode: 'full_day' | 'from_now'): void {
    commitData((draft) => {
      const plan = generateDailySchedule(draft, {
        targetDate: selectedDate,
        mode,
        nowMinutes: mode === 'from_now' ? getCurrentMinutesOfDay() : undefined,
        existingPlan: draft.schedulesByDate[selectedDate],
      });
      draft.schedulesByDate[selectedDate] = plan;
    }, mode === 'from_now' ? '已从当前时刻重新生成安排' : `已生成 ${selectedDate} 的时间规划`);
  }

  function toggleBlockCompleted(blockId: string): void {
    commitData((draft) => {
      const plan = draft.schedulesByDate[selectedDate];
      if (!plan) return;
      const block = plan.blocks.find((b) => b.id === blockId);
      if (!block) return;

      const nextDone = !block.completed;
      block.completed = nextDone;

      if (block.sourceType === 'main_task') {
        const task = draft.mainTasks.find((t) => t.id === block.sourceIds[0]);
        if (task) {
          if (nextDone) {
            const dur = block.endMinute - block.startMinute;
            block.creditedMinutes = dur;
            task.completedMinutes += dur;
            if (task.completedMinutes >= task.totalEstimatedMinutes) {
              task.status = 'completed';
            }
          } else {
            task.completedMinutes = Math.max(0, task.completedMinutes - block.creditedMinutes);
            block.creditedMinutes = 0;
            if (task.status === 'completed' && task.completedMinutes < task.totalEstimatedMinutes) {
              task.status = 'active';
            }
          }
          task.updatedAt = new Date().toISOString();
        }
      } else if (block.sourceType === 'small_task' || block.sourceType === 'errand_batch') {
        for (const sid of block.sourceIds) {
          const small = draft.smallTasks.find((t) => t.id === sid);
          if (small) {
            small.status = nextDone ? 'done' : 'pending';
            small.updatedAt = new Date().toISOString();
          }
        }
      }
    });
  }

  function toggleBlockLocked(blockId: string): void {
    commitData((draft) => {
      const plan = draft.schedulesByDate[selectedDate];
      const block = plan?.blocks.find((b) => b.id === blockId);
      if (block) block.locked = !block.locked;
    });
  }

  function shiftBlock(blockId: string, deltaMinutes: number): void {
    const plan = getSelectedPlan();
    const current = plan?.blocks.find((b) => b.id === blockId);
    if (!current) return;
    if (current.locked) {
      showToast('该时间块已锁定，请先解锁再调整时间');
      return;
    }
    const nextStart = current.startMinute + deltaMinutes;
    const nextEnd = current.endMinute + deltaMinutes;
    if (nextStart < 0 || nextEnd > 1440) {
      showToast('已到达当天时间边界（00:00–24:00）');
      return;
    }
    if (current.sourceType !== 'routine') {
      const hasConflict = plan?.blocks.some(
        (other) =>
          other.id !== blockId &&
          other.sourceType !== 'routine' &&
          nextStart < other.endMinute &&
          nextEnd > other.startMinute,
      );
      if (hasConflict) {
        showToast('移动后将与其他任务时间块重叠，请先调整相邻块');
        return;
      }
    }

    commitData((draft) => {
      const target = draft.schedulesByDate[selectedDate]?.blocks.find((b) => b.id === blockId);
      if (!target) return;
      target.startMinute = nextStart;
      target.endMinute = nextEnd;
      target.locked = true;
      target.reason = `${target.reason}（已手动微调并锁定）`;
    });
  }

  function removeBlock(blockId: string): void {
    commitData((draft) => {
      const plan = draft.schedulesByDate[selectedDate];
      if (!plan) return;
      plan.blocks = plan.blocks.filter((b) => b.id !== blockId);
    }, '已从今日规划中移除该时间块');
  }

  function addQuickSmallTask(replanAfter: boolean): void {
    const title = quickTitle.value.trim();
    if (!title) {
      showToast('请先输入突发小事标题');
      return;
    }
    const estimatedMinutes = Number(quickDuration.value) || 15;
    const winStart = quickWinStart.value || undefined;
    const winEnd = quickWinEnd.value || undefined;
    if (winStart && winEnd && parseTimeToMinutes(winStart) >= parseTimeToMinutes(winEnd)) {
      showToast('限定时间窗的最晚时间必须晚于最早时间');
      return;
    }

    const ok = commitData((draft) => {
      const nowIso = new Date().toISOString();
      const task: SmallTask = {
        id: createNotebookId('nb-small'),
        title,
        estimatedMinutes,
        urgency: quickUrgency.value as SmallTaskUrgency,
        preferredPeriod: quickPeriod.value as TimeOfDay,
        status: 'pending',
        updatedAt: nowIso,
      };
      const tag = quickTag.value.trim();
      if (tag) task.contextTag = tag;
      if (winStart) task.timeWindowStart = winStart;
      if (winEnd) task.timeWindowEnd = winEnd;
      draft.smallTasks.push(task);

      if (replanAfter) {
        const mode = selectedDate === getLocalDateString(0) ? 'from_now' : 'full_day';
        draft.schedulesByDate[selectedDate] = generateDailySchedule(draft, {
          targetDate: selectedDate,
          mode,
          nowMinutes: mode === 'from_now' ? getCurrentMinutesOfDay() : undefined,
          existingPlan: draft.schedulesByDate[selectedDate],
        });
      }
    }, replanAfter ? '已加入突发小事并重新排程' : '已加入突发小事池');

    if (ok) {
      quickTitle.value = '';
      quickTag.value = '';
      quickWinStart.value = '';
      quickWinEnd.value = '';
    }
  }

  function loadDemoTemplate(): void {
    commitData((draft) => {
      const nowIso = new Date().toISOString();
      const baseDate = selectedDate;
      draft.routines = [
        {
          id: 'nb-routine-demo-morning',
          title: '起床洗漱与早餐',
          category: 'meal',
          startTime: '07:30',
          endTime: '08:15',
          dayPattern: 'everyday',
          enabled: true,
          updatedAt: nowIso,
        },
        {
          id: 'nb-routine-demo-lunch',
          title: '午饭与午休充电',
          category: 'meal',
          startTime: '12:00',
          endTime: '13:30',
          dayPattern: 'everyday',
          enabled: true,
          updatedAt: nowIso,
        },
        {
          id: 'nb-routine-demo-exercise',
          title: '傍晚运动散步',
          category: 'exercise',
          startTime: '17:30',
          endTime: '18:15',
          dayPattern: 'everyday',
          enabled: true,
          updatedAt: nowIso,
        },
        {
          id: 'nb-routine-demo-dinner',
          title: '晚饭休息',
          category: 'meal',
          startTime: '18:15',
          endTime: '19:00',
          dayPattern: 'everyday',
          enabled: true,
          updatedAt: nowIso,
        },
      ];
      draft.phaseSpec = {
        phaseTitle: '示例模板：个人网站与核心专题推进期（可随意改写）',
        startDate: baseDate,
        endDate: addDaysToDate(baseDate, 6),
        guidelineNote: '示例规范：上午优先整块时间做高价值主体任务；同场景杂务合并处理；21:30 后不安排重脑力任务。',
        dayStart: '07:30',
        dayEnd: '22:30',
        preferredDeepWorkPeriod: 'morning',
        minMainTaskBlockMinutes: 60,
        maxMainTaskBlockMinutes: 120,
        breakBetweenBlocksMinutes: 10,
        dailyMainTaskTargetMinutes: 240,
        reserveErrandWindowMinutes: 30,
        highFocusCutoffTime: '21:30',
        batchSmallTasks: true,
        updatedAt: nowIso,
      };
      draft.mainTasks = [
        {
          id: 'nb-main-demo-project',
          title: '【示例】推进核心项目开发与文档整理',
          priority: 'P0',
          totalEstimatedMinutes: 300,
          completedMinutes: 0,
          dailyQuotaMinutes: 150,
          minSessionMinutes: 60,
          preferredPeriod: 'morning',
          deadline: addDaysToDate(baseDate, 4),
          status: 'active',
          updatedAt: nowIso,
        },
        {
          id: 'nb-main-demo-study',
          title: '【示例】系统学习专题与练习复盘',
          priority: 'P1',
          totalEstimatedMinutes: 180,
          completedMinutes: 0,
          dailyQuotaMinutes: 90,
          minSessionMinutes: 60,
          preferredPeriod: 'afternoon',
          status: 'active',
          updatedAt: nowIso,
        },
      ];
      draft.smallTasks = [
        {
          id: 'nb-small-demo-parcel',
          title: '【示例】下楼去驿站取快递',
          estimatedMinutes: 15,
          urgency: 'today_must',
          timeWindowStart: '16:30',
          timeWindowEnd: '19:30',
          preferredPeriod: 'afternoon',
          contextTag: '@出门',
          status: 'pending',
          updatedAt: nowIso,
        },
        {
          id: 'nb-small-demo-email',
          title: '【示例】回复重要消息与邮件',
          estimatedMinutes: 15,
          urgency: 'soon',
          preferredPeriod: 'any',
          contextTag: '@电脑',
          status: 'pending',
          updatedAt: nowIso,
        },
        {
          id: 'nb-small-demo-desk',
          title: '【示例】整理文件与更新本周待办',
          estimatedMinutes: 15,
          urgency: 'whenever',
          preferredPeriod: 'any',
          contextTag: '@电脑',
          status: 'pending',
          updatedAt: nowIso,
        },
      ];
      draft.schedulesByDate[baseDate] = generateDailySchedule(draft, {
        targetDate: baseDate,
        mode: 'full_day',
      });
    }, '已载入示例规划模板并生成今日时间轴');
  }

  function downloadTextFile(filename: string, content: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  // 事件绑定
  targetDateInput.addEventListener('change', () => {
    if (targetDateInput.value) {
      selectedDate = targetDateInput.value;
      renderAll();
    }
  });
  mustEl('#nb-btn-today').addEventListener('click', () => {
    selectedDate = getLocalDateString(0);
    targetDateInput.value = selectedDate;
    renderAll();
  });
  mustEl('#nb-btn-tomorrow').addEventListener('click', () => {
    selectedDate = getLocalDateString(1);
    targetDateInput.value = selectedDate;
    renderAll();
  });
  mustEl('#nb-btn-generate-full').addEventListener('click', () => runScheduler('full_day'));
  mustEl('#nb-btn-generate-now').addEventListener('click', () => runScheduler('from_now'));
  mustEl('#nb-btn-load-demo').addEventListener('click', loadDemoTemplate);

  // 快捷时长胶囊
  const durationPills = [...document.querySelectorAll<HTMLButtonElement>('#nb-quick-duration-pills button')];
  for (const pill of durationPills) {
    pill.addEventListener('click', () => {
      quickDuration.value = pill.dataset.min ?? '15';
      for (const p of durationPills) p.classList.toggle('active', p === pill);
    });
  }
  quickForm.addEventListener('submit', (event) => {
    event.preventDefault();
    addQuickSmallTask(false);
  });
  mustEl('#nb-quick-add-replan').addEventListener('click', () => addQuickSmallTask(true));

  mustEl('#nb-clear-done-small').addEventListener('click', () => {
    commitData((draft) => {
      draft.smallTasks = draft.smallTasks.filter((t) => t.status === 'pending');
    }, '已清理已完成或取消的小事');
  });

  // 选项卡切换
  const tabButtons = [...document.querySelectorAll<HTMLButtonElement>('#nb-tabs .nb-tab-btn')];
  const panels: Record<'small' | 'phase' | 'routine', HTMLElement> = {
    small: mustEl('#nb-panel-small'),
    phase: mustEl('#nb-panel-phase'),
    routine: mustEl('#nb-panel-routine'),
  };
  for (const btn of tabButtons) {
    btn.addEventListener('click', () => {
      const nextTab = (btn.dataset.tab ?? 'small') as 'small' | 'phase' | 'routine';
      activeTab = nextTab;
      for (const b of tabButtons) {
        const active = b.dataset.tab === activeTab;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      }
      for (const [key, panel] of Object.entries(panels)) {
        panel.hidden = key !== activeTab;
      }
    });
  }

  // 阶段规范保存
  phaseForm.addEventListener('submit', (event) => {
    event.preventDefault();
    commitData((draft) => {
      draft.phaseSpec = {
        phaseTitle: mustEl<HTMLInputElement>('#nb-phase-title').value.trim(),
        startDate: mustEl<HTMLInputElement>('#nb-phase-start').value,
        endDate: mustEl<HTMLInputElement>('#nb-phase-end').value,
        dayStart: mustEl<HTMLInputElement>('#nb-day-start').value,
        dayEnd: mustEl<HTMLInputElement>('#nb-day-end').value,
        highFocusCutoffTime: mustEl<HTMLInputElement>('#nb-cutoff-time').value,
        preferredDeepWorkPeriod: mustEl<HTMLSelectElement>('#nb-deep-period').value as 'morning' | 'afternoon' | 'evening',
        minMainTaskBlockMinutes: Number(mustEl<HTMLInputElement>('#nb-min-block').value),
        maxMainTaskBlockMinutes: Number(mustEl<HTMLInputElement>('#nb-max-block').value),
        breakBetweenBlocksMinutes: Number(mustEl<HTMLInputElement>('#nb-break-min').value),
        dailyMainTaskTargetMinutes: Number(mustEl<HTMLInputElement>('#nb-daily-target').value),
        reserveErrandWindowMinutes: Number(mustEl<HTMLInputElement>('#nb-errand-reserve').value),
        batchSmallTasks: mustEl<HTMLInputElement>('#nb-batch-small').checked,
        guidelineNote: mustEl<HTMLTextAreaElement>('#nb-phase-note').value,
        updatedAt: new Date().toISOString(),
      };
    }, '阶段安排规范已保存');
  });

  // 添加主体任务
  mainForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const titleInput = mustEl<HTMLInputElement>('#nb-main-title');
    const title = titleInput.value.trim();
    if (!title) return;
    const quotaVal = mustEl<HTMLInputElement>('#nb-main-quota').value;
    const deadlineVal = mustEl<HTMLInputElement>('#nb-main-deadline').value;

    const ok = commitData((draft) => {
      const task: MainTask = {
        id: createNotebookId('nb-main'),
        title,
        priority: mustEl<HTMLSelectElement>('#nb-main-priority').value as PriorityLevel,
        totalEstimatedMinutes: Number(mustEl<HTMLInputElement>('#nb-main-total').value),
        completedMinutes: 0,
        preferredPeriod: mustEl<HTMLSelectElement>('#nb-main-period').value as TimeOfDay,
        status: 'active',
        updatedAt: new Date().toISOString(),
      };
      if (quotaVal) task.dailyQuotaMinutes = Number(quotaVal);
      if (deadlineVal) task.deadline = deadlineVal;
      draft.mainTasks.push(task);
    }, '已添加阶段主体任务');

    if (ok) {
      titleInput.value = '';
      mustEl<HTMLInputElement>('#nb-main-deadline').value = '';
    }
  });

  // 固定日常自定义星期显隐 & 提交
  routinePattern.addEventListener('change', () => {
    customDaysBox.hidden = routinePattern.value !== 'custom';
  });
  routineForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const titleInput = mustEl<HTMLInputElement>('#nb-routine-title');
    const title = titleInput.value.trim();
    if (!title) return;
    const pattern = routinePattern.value as DayPattern;
    const checkedDays = [...customDaysBox.querySelectorAll<HTMLInputElement>('input:checked')].map(
      (input) => Number(input.value),
    );

    const ok = commitData((draft) => {
      const item: RoutineItem = {
        id: createNotebookId('nb-routine'),
        title,
        category: mustEl<HTMLSelectElement>('#nb-routine-cat').value as RoutineCategory,
        startTime: mustEl<HTMLInputElement>('#nb-routine-start').value,
        endTime: mustEl<HTMLInputElement>('#nb-routine-end').value,
        dayPattern: pattern,
        enabled: true,
        updatedAt: new Date().toISOString(),
      };
      if (pattern === 'custom') item.customDays = checkedDays;
      draft.routines.push(item);
    }, '已添加固定日常');

    if (ok) titleInput.value = '';
  });

  // 备份与导出弹窗
  mustEl('#nb-btn-open-backup').addEventListener('click', () => {
    mdPreview.value = exportNotebookMarkdown(store.data, selectedDate);
    importPreviewBox.hidden = true;
    importOptionsBox.hidden = true;
    pendingPreview = null;
    clearArmed = false;
    clearAllBtn.textContent = '清空全部本地数据';
    backupDialog.showModal();
  });
  mustEl('#nb-backup-close').addEventListener('click', () => backupDialog.close());

  mustEl('#nb-export-json-dl').addEventListener('click', () => {
    const json = exportBackupJson(store.data);
    downloadTextFile(`zhoujingxian-notebook-${selectedDate}.json`, json, 'application/json');
    showToast('已下载 JSON 完整备份');
  });
  mustEl('#nb-export-json-copy').addEventListener('click', async () => {
    await navigator.clipboard?.writeText(exportBackupJson(store.data));
    showToast('已复制 JSON 备份到剪贴板');
  });
  mustEl('#nb-export-md-dl').addEventListener('click', () => {
    const md = exportNotebookMarkdown(store.data, selectedDate);
    downloadTextFile(`zhoujingxian-plan-${selectedDate}.md`, md, 'text/markdown;charset=utf-8');
    showToast('已下载 Markdown 规划表');
  });
  mustEl('#nb-export-md-copy').addEventListener('click', async () => {
    await navigator.clipboard?.writeText(exportNotebookMarkdown(store.data, selectedDate));
    showToast('已复制 Markdown 规划表到剪贴板');
  });

  importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    if (!file) return;
    importText.value = await file.text();
  });

  mustEl('#nb-import-preview-btn').addEventListener('click', () => {
    try {
      const preview = previewBackupImport(store.data, importText.value);
      pendingPreview = preview;
      const s = preview.summary;
      importPreviewBox.textContent =
        `校验通过！预览变更：` +
        `固定日常（新增 ${s.routines.added} / 冲突 ${s.routines.conflicts}）、` +
        `主体任务（新增 ${s.mainTasks.added} / 冲突 ${s.mainTasks.conflicts}）、` +
        `突发小事（新增 ${s.smallTasks.added} / 冲突 ${s.smallTasks.conflicts}）、` +
        `历史日程（新增 ${s.schedules.added} / 冲突 ${s.schedules.conflicts}）。`;
      importPreviewBox.hidden = false;
      importOptionsBox.hidden = false;
    } catch (error) {
      pendingPreview = null;
      importPreviewBox.textContent =
        error instanceof Error ? `校验失败：${error.message}` : '备份内容校验失败';
      importPreviewBox.hidden = false;
      importOptionsBox.hidden = true;
    }
  });

  mustEl('#nb-import-confirm-btn').addEventListener('click', () => {
    if (!pendingPreview) return;
    const selectedRadio = document.querySelector<HTMLInputElement>(
      'input[name="nb-import-strategy"]:checked',
    );
    const mode = selectedRadio?.value ?? 'merge_keep';
    const strategy = mode === 'replace' ? 'replace' : 'merge';
    const overwrite = mode === 'merge_overwrite';

    const previousSnapshot = JSON.parse(JSON.stringify(store.data)) as NotebookData;
    const merged = mergeBackupData(store.data, pendingPreview.incoming, strategy, overwrite);
    try {
      const persisted = store.save(merged, false);
      preImportSnapshot = previousSnapshot;
      importUndoBtn.hidden = false;
      updateSaveStatus(persisted);
      renderAll();
      mdPreview.value = exportNotebookMarkdown(store.data, selectedDate);
      importPreviewBox.hidden = true;
      importOptionsBox.hidden = true;
      pendingPreview = null;
      showToast('导入恢复成功，如有需要可点击撤销');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导入失败');
    }
  });

  importUndoBtn.addEventListener('click', () => {
    if (!preImportSnapshot) return;
    const snapshot = preImportSnapshot;
    preImportSnapshot = null;
    importUndoBtn.hidden = true;
    store.save(snapshot, false);
    updateSaveStatus(store.persistent);
    renderAll();
    mdPreview.value = exportNotebookMarkdown(store.data, selectedDate);
    showToast('已撤回上一次导入');
  });

  clearAllBtn.addEventListener('click', () => {
    if (!clearArmed) {
      clearArmed = true;
      clearAllBtn.textContent = '再次点击确认清空全部数据';
      return;
    }
    clearArmed = false;
    clearAllBtn.textContent = '清空全部本地数据';
    const empty = createEmptyNotebookData();
    const persisted = store.save(empty, false);
    updateSaveStatus(persisted);
    renderAll();
    mdPreview.value = exportNotebookMarkdown(store.data, selectedDate);
    backupDialog.close();
    showToast('已重置为空白记事本');
  });

  // 多标签页同步提示
  window.addEventListener('storage', (event) => {
    if (event.key === 'zhoujingxian.notebook.v1') {
      store.latest();
      updateSaveStatus(store.persistent);
      renderAll();
      showToast('检测到其他标签页更新了记事本，已同步最新记录');
    }
  });

  updateSaveStatus(store.persistent);
  renderAll();
}

initNotebook();
