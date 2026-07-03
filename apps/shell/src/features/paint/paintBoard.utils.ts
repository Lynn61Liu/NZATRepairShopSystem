export type StageKey =
  | "on_hold"
  | "waiting"
  | "sheet"
  | "undercoat"
  | "sanding"
  | "painting"
  | "assembly"
  | "done"
  | "delivered";

export const PAINT_STAGE_ORDER: StageKey[] = [
  "on_hold",
  "waiting",
  "sheet",
  "undercoat",
  "sanding",
  "painting",
  "assembly",
  "done",
  "delivered",
];

export const PAINT_STAGE_PROGRESS_ORDER: StageKey[] = [
  "waiting",
  "sheet",
  "undercoat",
  "sanding",
  "painting",
  "assembly",
  "done",
  "delivered",
];

export const PAINT_STAGE_INDEX_BY_KEY: Record<StageKey, number> = {
  on_hold: -2,
  waiting: -1,
  sheet: 0,
  undercoat: 1,
  sanding: 2,
  painting: 3,
  assembly: 4,
  done: 5,
  delivered: 6,
};

export const PAINT_STAGE_LABELS: Record<StageKey, string> = {
  on_hold: "On Hold",
  waiting: "等待处理",
  sheet: "钣金/底漆",
  undercoat: "打底漆",
  sanding: "底漆打磨",
  painting: "喷漆",
  assembly: "组装抛光",
  done: "完成喷漆",
  delivered: "交车完毕",
};

export const PAINT_STAGE_OPTIONS = PAINT_STAGE_ORDER.map((key) => ({
  key,
  label: PAINT_STAGE_LABELS[key],
  stageIndex: PAINT_STAGE_INDEX_BY_KEY[key],
}));

export type PaintBoardJob = {
  id: string;
  createdAt: string;
  plate: string;
  year?: number;
  make?: string;
  model?: string;
  jobStatus?: string | null;
  vehicleStatus?: string | null;
  status?: string | null;
  currentStage?: number | null;
  hasWofService?: boolean;
  wofStatus?: "Todo" | "Checked" | "Recorded" | null;
  hasMechService?: boolean;
  daysInStage?: number;
  panels?: number | null;
  notes?: string | null;
};

const isArchivedStatus = (status?: string | null) => status?.trim().toLowerCase() === "archived";

export const isArchivedPaintJob = (job: PaintBoardJob) =>
  isArchivedStatus(job.jobStatus) || isArchivedStatus(job.vehicleStatus) || isArchivedStatus(job.status);

export const shouldHidePaintBoardJob = (job: PaintBoardJob) => isArchivedPaintJob(job);

export const normalizeDate = (value: string | Date) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

export const diffDays = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / 86400000);

export const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const buildDays = (start: Date, count: number) => {
  return Array.from({ length: count }, (_, index) => {
    const current = addDays(start, index);
    const label = current.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
    return { label, day: current.getDate(), date: current };
  });
};

export const mapStageKey = (status?: string | null, currentStage?: number | null): StageKey => {
  if (status === "delivered") return "delivered";
  if (status === "done") return "done";
  if (typeof currentStage === "number" && currentStage <= -2) return "on_hold";
  if (typeof currentStage !== "number" || currentStage < 0) return "waiting";
  if (currentStage <= 0) return "sheet";
  if (currentStage === 1) return "undercoat";
  if (currentStage === 2) return "sanding";
  if (currentStage === 3) return "painting";
  if (currentStage >= 4) return "assembly";
  return "waiting";
};

export const getDurationDays = (createdAt: string, today = new Date()) => {
  const anchor = normalizeDate(today);
  const created = normalizeDate(createdAt);
  return Math.max(1, diffDays(anchor, created) + 1);
};

export const countOverdue = (jobs: PaintBoardJob[], today = new Date()) => {
  return jobs.filter((job) => {
    const stage = mapStageKey(job.status ?? undefined, job.currentStage ?? undefined);
    if (stage === "done" || stage === "delivered") return false;
    return getDurationDays(job.createdAt, today) >= 3;
  }).length;
};
