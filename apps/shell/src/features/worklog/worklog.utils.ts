import type { WorklogEntry, WorklogFlag } from "./types";

const TECH_PILL_COLOR_CLASSES = [
  "border border-slate-200 bg-slate-100 text-slate-700",
  "border border-sky-100 bg-sky-50 text-sky-700",
  "border border-amber-100 bg-amber-50 text-amber-700",
  "border border-fuchsia-100 bg-fuchsia-50 text-fuchsia-700",
  "border border-rose-100 bg-rose-50 text-rose-700",
  "border border-amber-200 bg-amber-100 text-amber-900",
  "border border-emerald-100 bg-emerald-50 text-emerald-700",
];

const TECH_ROW_COLOR_CLASSES = [
  "bg-slate-50/80",
  "bg-sky-50/80",
  "bg-amber-50/75",
  "bg-fuchsia-50/75",
  "bg-rose-50/75",
  "bg-amber-100/55",
  "bg-emerald-50/80",
];

export function parseTimeRange(input: string): { start: string; end: string; hours: number } | null {
  const normalized = input.replace(/[–—~～]/g, "-");
  const parts = normalized.split(/\s*-\s*/);
  if (parts.length !== 2) return null;
  const startRaw = parts[0].trim();
  const endRaw = parts[1].trim();
  if (!startRaw || !endRaw) return null;

  const startMinutes = parseTimeValue(startRaw);
  const endMinutes = parseTimeValue(endRaw);
  if (startMinutes === null || endMinutes === null) return null;
  if (endMinutes <= startMinutes) return null;

  return {
    start: startRaw,
    end: endRaw,
    hours: (endMinutes - startMinutes) / 60,
  };
}

export function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateTime(date: Date) {
  const dateStr = formatDate(date);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${dateStr} ${hours}:${minutes}:${seconds}`;
}

export function isValidTimeValue(value: string) {
  return parseTimeValue(value) !== null;
}

function parseTimeValue(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2})(?:[.:](\d{2}))?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? "00");
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function timeToMinutes(value: string) {
  return parseTimeValue(value) ?? Number.NaN;
}

export function calculateDuration(start: string, end: string) {
  const startMinutes = parseTimeValue(start);
  const endMinutes = parseTimeValue(end);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return 0;
  return (endMinutes - startMinutes) / 60;
}

export function calculateWage(start: string, end: string, costRate: number) {
  const duration = calculateDuration(start, end);
  if (duration <= 0 || !Number.isFinite(duration)) return 0;
  return duration * costRate;
}

function timesOverlap(start1: string, end1: string, start2: string, end2: string) {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);
  if (![s1, e1, s2, e2].every((value) => Number.isFinite(value))) return false;
  return s1 < e2 && s2 < e1;
}

export function detectFlags(log: WorklogEntry, allLogs: WorklogEntry[]): WorklogFlag[] {
  const flags: WorklogFlag[] = [];
  if (calculateDuration(log.start_time, log.end_time) > 6) {
    flags.push("long_session");
  }

  const similarLogs = allLogs.filter(
    (other) =>
      other.id !== log.id &&
      other.staff_name === log.staff_name &&
      other.rego === log.rego &&
      other.work_date === log.work_date
  );

  for (const other of similarLogs) {
    if (timesOverlap(log.start_time, log.end_time, other.start_time, other.end_time)) {
      if (!flags.includes("overlap")) flags.push("overlap");
      if (!flags.includes("duplicate")) flags.push("duplicate");
      break;
    }

    const startDiff = Math.abs(timeToMinutes(log.start_time) - timeToMinutes(other.start_time));
    const endDiff = Math.abs(timeToMinutes(log.end_time) - timeToMinutes(other.end_time));
    if (Number.isFinite(startDiff) && Number.isFinite(endDiff)) {
      if (startDiff <= 30 && endDiff <= 30 && !flags.includes("duplicate")) {
        flags.push("duplicate");
      }
    }
  }

  return flags;
}

export function buildStaffColorMap(names: string[]) {
  const uniqueNames = Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, "zh-CN"));
  const map = new Map<string, { pill: string; row: string }>();
  uniqueNames.forEach((name, index) => {
    map.set(name, {
      pill: TECH_PILL_COLOR_CLASSES[index % TECH_PILL_COLOR_CLASSES.length],
      row: TECH_ROW_COLOR_CLASSES[index % TECH_ROW_COLOR_CLASSES.length],
    });
  });
  return map;
}

export function getStaffPillColor(name: string, colorMap?: Map<string, { pill: string; row: string }>) {
  return colorMap?.get(name)?.pill ?? TECH_PILL_COLOR_CLASSES[0];
}

export function getStaffRowColor(name: string, colorMap?: Map<string, { pill: string; row: string }>) {
  return colorMap?.get(name)?.row ?? TECH_ROW_COLOR_CLASSES[0];
}

export function flagLabel(flag: WorklogFlag) {
  if (flag === "duplicate") return "可能重复";
  if (flag === "overlap") return "时间重叠";
  return "长时间作业";
}
