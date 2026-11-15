export const STORAGE_KEY = 'zhoujingxian.notebook.v1';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'any';
export type DayPattern = 'everyday' | 'weekdays' | 'weekends' | 'custom';
export type PriorityLevel = 'P0' | 'P1' | 'P2';
export type SmallTaskUrgency = 'today_must' | 'soon' | 'whenever';
export type RoutineCategory = 'sleep' | 'meal' | 'work' | 'study' | 'exercise' | 'commute' | 'other';

export interface RoutineItem {
  id: string;
  title: string;
  category: RoutineCategory;
  startTime: string;
  endTime: string;
  dayPattern: DayPattern;
  customDays?: number[];
  enabled: boolean;
  notes?: string;
  updatedAt: string;
}

export interface PhaseRuleConfig {
  phaseTitle: string;
  startDate: string;
  endDate: string;
  guidelineNote: string;
  dayStart: string;
  dayEnd: string;
  preferredDeepWorkPeriod: Exclude<TimeOfDay, 'any'>;
  minMainTaskBlockMinutes: number;
  maxMainTaskBlockMinutes: number;
  breakBetweenBlocksMinutes: number;
  dailyMainTaskTargetMinutes: number;
  reserveErrandWindowMinutes: number;
  highFocusCutoffTime: string;
  batchSmallTasks: boolean;
  updatedAt: string;
}

export interface MainTask {
  id: string;
  title: string;
  description?: string;
  priority: PriorityLevel;
  totalEstimatedMinutes: number;
  completedMinutes: number;
  dailyQuotaMinutes?: number;
  minSessionMinutes?: number;
  preferredPeriod: TimeOfDay;
  deadline?: string;
  status: 'active' | 'paused' | 'completed';
  updatedAt: string;
}

export interface SmallTask {
  id: string;
  title: string;
  estimatedMinutes: number;
  urgency: SmallTaskUrgency;
  targetDate?: string;
  timeWindowStart?: string;
  timeWindowEnd?: string;
  preferredPeriod: TimeOfDay;
  contextTag?: string;
  status: 'pending' | 'done' | 'cancelled';
  updatedAt: string;
}

export interface ScheduledBlock {
  id: string;
  date: string;
  sourceType: 'routine' | 'main_task' | 'small_task' | 'errand_batch' | 'break';
  sourceIds: string[];
  title: string;
  startMinute: number;
  endMinute: number;
  locked: boolean;
  completed: boolean;
  creditedMinutes: number;
  reason: string;
}

export interface UnscheduledTaskNote {
  taskType: 'main_task' | 'small_task';
  taskId: string;
  title: string;
  reason: string;
}

export interface DailySchedulePlan {
  date: string;
  generatedAt: string;
  mode: 'full_day' | 'from_now';
  blocks: ScheduledBlock[];
  unscheduledTasks: UnscheduledTaskNote[];
  warnings: string[];
}

export interface NotebookData {
  schemaVersion: 1;
  updatedAt: string;
  routines: RoutineItem[];
  phaseSpec: PhaseRuleConfig;
  mainTasks: MainTask[];
  smallTasks: SmallTask[];
  schedulesByDate: Record<string, DailySchedulePlan>;
}
