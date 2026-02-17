import type { JobStatus } from "@/types/JobType";
import type { TagOption } from "@/components/MultiTagSelect";

// 1) GRID_COLS：表格列宽配置集中
export const GRID_COLS =
  // <640：隐藏 电话 + 创建时间
  "grid-cols-[30px_80px_90px_100px_70px_140px_80px_60px_60px_60px_80px_64px] " +
  // ≥640 (sm)
  "sm:grid-cols-[30px_90px_100px_120px_80px_180px_100px_64px_64px_64px_100px_64px] " +
  // ≥768 (md)
  "md:grid-cols-[30px_100px_100px_130px_80px_140px_110px_65px_65px_65px_90px_64px] " +
  // ≥1024 (lg)：显示客户电话
  "lg:grid-cols-[30px_110px_110px_130px_80px_140px_110px_65px_65px_65px_90px_100px_64px] " +
  // ≥1440：完整显示所有字段（包括创建时间）
  "1440:grid-cols-[30px_120px_120px_160px_80px_140px_120px_65px_65px_65px_90px_110px_150px_64px]";

// 2) TAG_OPTIONS：筛选 Tag 配置集中（id=存储值，label=展示值）
export const TAG_OPTIONS: TagOption[] = [
  { id: "badge", label: "Badge" },
  { id: "vip", label: "VIP" },
  { id: "urgent", label: "Urgent" },
  { id: "parts", label: "Parts" },
  { id: "repeat", label: "Repeat" },
];

// 3) pageSize：分页大小配置集中
export const JOBS_PAGE_SIZE = 6;

// 4) Status 的 label 映射集中（中英都可以在这里控制）
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  Completed: "维修完成",
  "In Progress": "进行中",
  Pending: "Pending",
  Ready: "可交车",
  Archived: "归档",
  Cancelled: "取消",
};

// 5) Status 的样式配置集中（StatusPill 不再 if-else）
export const JOB_STATUS_STYLES: Record<
  JobStatus,
  { bg: string; bd: string; tx: string; dot: string }
> = {
  Completed: {
    bg: "bg-green-100",
    bd: "border-green-300",
    tx: "text-green-700",
    dot: "bg-green-600",
  },
  "In Progress": {
    bg: "bg-amber-100",
    bd: "border-amber-300",
    tx: "text-amber-700",
    dot: "bg-amber-600",
  },
  Ready: {
    bg: "bg-blue-100",
    bd: "border-blue-300",
    tx: "text-blue-700",
    dot: "bg-blue-600",
  },
  Archived: {
    bg: "bg-slate-100",
    bd: "border-slate-300",
    tx: "text-slate-700",
    dot: "bg-slate-600",
  },
  Cancelled: {
    bg: "bg-red-100",
    bd: "border-red-300",
    tx: "text-red-700",
    dot: "bg-red-600",
  },
  Pending: {
    bg: "bg-slate-100",
    bd: "border-slate-300",
    tx: "text-slate-700",
    dot: "bg-slate-600",
  },
};
