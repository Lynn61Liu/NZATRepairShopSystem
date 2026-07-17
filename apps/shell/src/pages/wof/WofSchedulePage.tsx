import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { ChevronLeft, ChevronRight, Clock3, ExternalLink, GripVertical, RefreshCcw } from "lucide-react";
import { Button, Card, useToast } from "@/components/ui";
import { withApiBase } from "@/utils/api";
import { formatNzDateTime, parseTimestamp } from "@/utils/date";
import { notifyPaintBoardRefresh, notifyWofScheduleRefresh, subscribeWofScheduleRefresh } from "@/utils/refreshSignals";
import { useRef } from "react";
import { updateWofStatus as apiUpdateWofStatus } from "@/features/wof/api/wofApi";

const STORAGE_KEY = "wof:schedule:placements:v1";
const PLACEHOLDER_STORAGE_KEY = "wof:schedule:placeholders:v1";
const DRAG_TYPE = "wof-job-card";
const PLACEHOLDER_PLACEMENT_PREFIX = "placeholder:";
const LOCAL_SAVE_DEBOUNCE_MS = 700;
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 18;
const SLOT_HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, index) => DAY_START_HOUR + index);

type WofScheduleJob = {
  jobId: string;
  plate: string;
  make: string;
  model: string;
  year?: number | null;
  vin: string;
  wofExpiry: string;
  inShopDateTime: string;
  status: string;
  wofStatus?: "Todo" | "Checked" | "Recorded" | null;
};

type WofSchedulePlaceholder = {
  placeholderId: string;
  rego: string;
  contact: string;
  notes: string;
  createdAt: string;
};

type PlaceholderDraft = Pick<WofSchedulePlaceholder, "rego" | "contact" | "notes">;

type WofScheduleEntryResponse = {
  kind?: string | null;
  jobId?: string | null;
  placeholderId?: string | null;
  scheduledDate?: string | null;
  scheduledHour?: number | null;
  rego?: string | null;
  contact?: string | null;
  notes?: string | null;
  createdAt?: string | null;
};

type WofScheduleSaveEntry = {
  kind: "job" | "placeholder";
  jobId?: string;
  placeholderId?: string;
  scheduledDate?: string;
  scheduledHour?: number;
  rego?: string;
  contact?: string;
  notes?: string;
  createdAt?: string;
};

type Placement =
  | { kind: "backlog" }
  | { kind: "slot"; slotKey: string }
  | { kind: "completed" };

type PlacementMap = Record<string, Placement>;

type DragItem =
  | { kind: "job"; jobId: string }
  | { kind: "placeholder"; placeholderId: string }
  | { kind: "placeholder-template" };

type WorkingDay = {
  key: string;
  label: string;
  shortDate: string;
};

function enforceSingleCheckedPerSlot(
  placements: PlacementMap,
  jobs: WofScheduleJob[],
  preferredCheckedJobId?: string
) {
  const next = { ...placements };
  const jobMap = new Map(jobs.map((job) => [job.jobId, job]));
  const checkedBySlot = new Map<string, string[]>();

  for (const [jobId, placement] of Object.entries(next)) {
    if (placement.kind !== "slot") continue;
    const job = jobMap.get(jobId);
    if (!job || job.wofStatus !== "Checked") continue;
    const list = checkedBySlot.get(placement.slotKey) ?? [];
    list.push(jobId);
    checkedBySlot.set(placement.slotKey, list);
  }

  for (const [, checkedJobIds] of checkedBySlot.entries()) {
    if (checkedJobIds.length <= 1) continue;

    const keepId = preferredCheckedJobId && checkedJobIds.includes(preferredCheckedJobId)
      ? preferredCheckedJobId
      : checkedJobIds[checkedJobIds.length - 1];

    for (const jobId of checkedJobIds) {
      if (jobId === keepId) continue;
      next[jobId] = { kind: "backlog" };
    }
  }

  return next;
}

function loadPlacements(): PlacementMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as PlacementMap;
  } catch {
    return {};
  }
}

function savePlacements(next: PlacementMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function getPlaceholderPlacementKey(placeholderId: string) {
  return `${PLACEHOLDER_PLACEMENT_PREFIX}${placeholderId}`;
}

function getPlaceholderIdFromPlacementKey(placementKey: string) {
  return placementKey.startsWith(PLACEHOLDER_PLACEMENT_PREFIX)
    ? placementKey.slice(PLACEHOLDER_PLACEMENT_PREFIX.length)
    : null;
}

function loadPlaceholders(): WofSchedulePlaceholder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PLACEHOLDER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object" && typeof item.placeholderId === "string")
      .map((item) => ({
        placeholderId: item.placeholderId,
        rego: typeof item.rego === "string" ? item.rego : "",
        contact: typeof item.contact === "string" ? item.contact : "",
        notes: typeof item.notes === "string" ? item.notes : "",
        createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

function savePlaceholders(next: WofSchedulePlaceholder[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PLACEHOLDER_STORAGE_KEY, JSON.stringify(next));
}

function createPlaceholderFromDraft(draft: PlaceholderDraft): WofSchedulePlaceholder {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    placeholderId: suffix,
    rego: draft.rego.trim(),
    contact: draft.contact.trim(),
    notes: draft.notes.trim(),
    createdAt: new Date().toISOString(),
  };
}

function parseSlotKey(slotKey: string) {
  const match = /^(\d{4}-\d{2}-\d{2})-(\d{1,2})$/.exec(slotKey);
  if (!match) return null;
  const hour = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  return { scheduledDate: match[1], scheduledHour: hour };
}

function buildScheduleSaveEntries(
  placements: PlacementMap,
  placeholders: WofSchedulePlaceholder[]
): WofScheduleSaveEntry[] {
  const entries: WofScheduleSaveEntry[] = [];
  const placeholderMap = new Map(placeholders.map((placeholder) => [placeholder.placeholderId, placeholder]));
  const scheduledPlaceholderIds = new Set<string>();

  for (const [placementKey, placement] of Object.entries(placements)) {
    if (placement.kind !== "slot") continue;
    const slot = parseSlotKey(placement.slotKey);
    if (!slot) continue;

    const placeholderId = getPlaceholderIdFromPlacementKey(placementKey);
    if (placeholderId) {
      const placeholder = placeholderMap.get(placeholderId);
      if (!placeholder) continue;
      scheduledPlaceholderIds.add(placeholderId);
      entries.push({
        kind: "placeholder",
        placeholderId,
        scheduledDate: slot.scheduledDate,
        scheduledHour: slot.scheduledHour,
        rego: placeholder.rego,
        contact: placeholder.contact,
        notes: placeholder.notes,
        createdAt: placeholder.createdAt,
      });
      continue;
    }

    entries.push({
      kind: "job",
      jobId: placementKey,
      scheduledDate: slot.scheduledDate,
      scheduledHour: slot.scheduledHour,
    });
  }

  for (const placeholder of placeholders) {
    if (scheduledPlaceholderIds.has(placeholder.placeholderId)) continue;
    entries.push({
      kind: "placeholder",
      placeholderId: placeholder.placeholderId,
      rego: placeholder.rego,
      contact: placeholder.contact,
      notes: placeholder.notes,
      createdAt: placeholder.createdAt,
    });
  }

  return entries;
}

function mapServerScheduleEntries(entries: WofScheduleEntryResponse[]) {
  const nextPlacements: PlacementMap = {};
  const nextPlaceholders: WofSchedulePlaceholder[] = [];

  for (const entry of entries) {
    const scheduledDate = typeof entry.scheduledDate === "string" ? entry.scheduledDate : "";
    const scheduledHour = Number(entry.scheduledHour);
    const hasSlot = Boolean(scheduledDate) && Number.isInteger(scheduledHour);
    const placement: Placement = hasSlot
      ? { kind: "slot", slotKey: `${scheduledDate}-${scheduledHour}` }
      : { kind: "backlog" };

    if (entry.kind === "job" && entry.jobId) {
      nextPlacements[String(entry.jobId)] = placement;
      continue;
    }

    if (entry.kind === "placeholder" && entry.placeholderId) {
      const placeholderId = String(entry.placeholderId);
      nextPlaceholders.push({
        placeholderId,
        rego: entry.rego ?? "",
        contact: entry.contact ?? "",
        notes: entry.notes ?? "",
        createdAt: entry.createdAt ?? new Date().toISOString(),
      });
      nextPlacements[getPlaceholderPlacementKey(placeholderId)] = placement;
    }
  }

  return { placements: nextPlacements, placeholders: nextPlaceholders };
}

async function saveWofScheduleEntries(entries: WofScheduleSaveEntry[]) {
  const res = await fetch(withApiBase("/api/jobs/wof-schedule"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || "Failed to save WOF schedule.");
  }
}

function getNzCalendarDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

function buildWorkingDays(weekOffset: number): WorkingDay[] {
  const formatter = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    weekday: "short",
    day: "2-digit",
    month: "short",
  });

  const nowParts = getNzCalendarDateParts(new Date());
  const todayUtc = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day));
  const currentWeekday = todayUtc.getUTCDay();
  const diffToMonday = currentWeekday === 0 ? -6 : 1 - currentWeekday;
  const weekStart = new Date(todayUtc);
  weekStart.setUTCDate(todayUtc.getUTCDate() + diffToMonday + weekOffset * 7);

  const results: WorkingDay[] = [];
  for (let index = 0; index < 7; index += 1) {
    const cursor = new Date(weekStart);
    cursor.setUTCDate(weekStart.getUTCDate() + index);
    const key = [
      cursor.getUTCFullYear(),
      String(cursor.getUTCMonth() + 1).padStart(2, "0"),
      String(cursor.getUTCDate()).padStart(2, "0"),
    ].join("-");
    const formatted = formatter.formatToParts(cursor);
    const map = Object.fromEntries(formatted.map((part) => [part.type, part.value]));
    results.push({
      key,
      label: `${map.weekday} ${map.day} ${map.month}`,
      shortDate: `${map.day}/${map.month}`,
    });
  }

  return results;
}

function formatWeekRange(days: WorkingDay[]) {
  if (days.length === 0) return "";
  return `${days[0].label} - ${days[days.length - 1].label}`;
}

function formatVehicleLabel(job: WofScheduleJob) {
  const parts = [job.year, job.make, job.model]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);
  return parts.length ? parts.join(" ") : "Vehicle details missing";
}

function getSlotLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function getInShopDaysLabel(inShopDateTime: string) {
  const parsed = parseTimestamp(inShopDateTime);
  if (!parsed) return "—";
  const diffMs = Math.max(0, Date.now() - parsed.getTime());
  const days = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
  return `${days}d`;
}

function openNztaAndCopyVin(vin: string, toast: ReturnType<typeof useToast>) {
  if (!vin.trim()) {
    toast.error("This vehicle does not have a VIN yet.");
    return;
  }

  navigator.clipboard.writeText(vin.trim())
    .then(() => {
      toast.success("VIN copied. Opening NZTA.");
      window.open("https://vic.nzta.govt.nz/", "_blank", "noopener,noreferrer");
    })
    .catch(() => {
      toast.error("Failed to copy VIN.");
    });
}

function WofStatusBadge({ status }: { status?: WofScheduleJob["wofStatus"] }) {
  if (!status) return null;

  const config =
    status === "Recorded"
      ? {
          label: "已录入",
          bg: "bg-sky-50",
          bd: "border-sky-200",
          tx: "text-sky-700",
        }
      : status === "Checked"
        ? {
            label: "检查完成",
            bg: "bg-amber-50",
            bd: "border-amber-200",
            tx: "text-amber-700",
          }
        : {
            label: "待查",
            bg: "bg-white",
            bd: "border-slate-200",
            tx: "text-slate-700",
          };

  return (
    <span
      className={[
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        config.bg,
        config.bd,
        config.tx,
      ].join(" ")}
    >
      {config.label}
    </span>
  );
}

function getCardTone(status?: WofScheduleJob["wofStatus"]) {
  if (status === "Checked") {
    return "border-amber-200 bg-amber-50 hover:border-amber-300";
  }
  if (status === "Recorded") {
    return "border-sky-200 bg-sky-50 hover:border-sky-300";
  }
  return "border-slate-200 bg-white hover:border-slate-300";
}

function getCompactRowTone(status?: WofScheduleJob["wofStatus"]) {
  if (status === "Checked") {
    return {
      row: "bg-amber-50/80 hover:bg-amber-100",
      dot: "bg-amber-400",
    };
  }

  return {
    row: "bg-transparent hover:bg-slate-200/90",
    dot: "bg-sky-500",
  };
}

function WofStatusSelect({
  value,
  onChange,
  disabled,
}: {
  value?: WofScheduleJob["wofStatus"];
  onChange: (next: "Todo" | "Checked") => void;
  disabled?: boolean;
}) {
  return (
    <select
      className="pointer-events-auto h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 shadow-sm outline-none transition focus:border-[var(--ds-primary)]"
      value={value === "Checked" ? "Checked" : "Todo"}
      onChange={(e) => onChange(e.target.value as "Todo" | "Checked")}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      disabled={disabled}
    >
      <option value="Todo">待查</option>
      <option value="Checked">检查完成</option>
    </select>
  );
}

function WofDetailedCardContent({
  job,
  onNzta,
  onStatusChange,
  statusUpdating = false,
}: {
  job: WofScheduleJob;
  onNzta?: () => void;
  onStatusChange?: (next: "Todo" | "Checked") => void;
  statusUpdating?: boolean;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="truncate text-base font-semibold text-slate-900">{job.plate}</div>
              <Link
                to={`/jobs/${job.jobId}?tab=WOF`}
                className="shrink-0 text-xs font-medium text-[var(--ds-primary)] underline-offset-2 hover:underline"
              >
                #{job.jobId}
              </Link>
              <WofStatusBadge status={job.wofStatus} />
            </div>
            <div className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
              {getInShopDaysLabel(job.inShopDateTime)}
            </div>
          </div>
          <div className="text-xs text-slate-500">{formatVehicleLabel(job)}</div>
        </div>
        <GripVertical className="mt-0.5 h-4 w-4 text-slate-400" />
      </div>
      <dl className="grid gap-2 text-xs text-slate-600">
        <div className="flex items-start justify-between gap-3">
          <dt className="font-medium text-slate-500">VIN</dt>
          <dd className="max-w-[180px] text-right font-mono text-[11px] text-slate-800">{job.vin || "—"}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="font-medium text-slate-500">WOF Expiry</dt>
          <dd className="text-right text-slate-800">{job.wofExpiry || "—"}</dd>
        </div>
      </dl>
      <div className="flex items-center justify-end gap-2 pt-1">
        {onStatusChange ? (
          <WofStatusSelect value={job.wofStatus} onChange={onStatusChange} disabled={statusUpdating} />
        ) : null}
        {onNzta ? (
          <Button
            variant="ghost"
            className="h-8 border-slate-200 px-2 text-xs"
            leftIcon={<ExternalLink className="h-3.5 w-3.5" />}
            onClick={onNzta}
          >
            NZTA
          </Button>
        ) : null}
      </div>
    </>
  );
}

function WofJobCard({
  job,
  compact = false,
  showNztaAction = false,
  onNzta,
  onStatusChange,
  statusUpdating = false,
}: {
  job: WofScheduleJob;
  compact?: boolean;
  showNztaAction?: boolean;
  onNzta?: () => void;
  onStatusChange?: (next: "Todo" | "Checked") => void;
  statusUpdating?: boolean;
}) {
  const dragRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayPosition, setOverlayPosition] = useState<{ top: number; left: number } | null>(null);
  const [{ isDragging }, drag] = useDrag(() => ({
    type: DRAG_TYPE,
    item: { kind: "job", jobId: job.jobId } satisfies DragItem,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [job.jobId]);
  const attachDragRef = useCallback((node: HTMLDivElement | null) => {
    dragRef.current = node;
    drag(node);
  }, [drag]);
  const tone = getCardTone(job.wofStatus);
  const compactTone = getCompactRowTone(job.wofStatus);

  const updateOverlayPosition = useCallback(() => {
    if (!compact || !dragRef.current || typeof window === "undefined") return;
    const rect = dragRef.current.getBoundingClientRect();
    const overlayWidth = 420;
    const overlayHeight = 320;
    const gutter = 12;
    const left = rect.right + gutter + overlayWidth <= window.innerWidth
      ? rect.right + gutter
      : Math.max(16, rect.left - overlayWidth - gutter);
    const top = Math.min(
      Math.max(16, rect.top - 8),
      Math.max(16, window.innerHeight - overlayHeight - 16)
    );
    setOverlayPosition({ top, left });
  }, [compact]);

  const openOverlay = useCallback(() => {
    if (!compact) return;
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    updateOverlayPosition();
    setOverlayOpen(true);
  }, [compact, updateOverlayPosition]);

  const scheduleCloseOverlay = useCallback(() => {
    if (!compact) return;
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setOverlayOpen(false);
      closeTimerRef.current = null;
    }, 120);
  }, [compact]);

  useEffect(() => {
    if (!overlayOpen || !compact) return;
    const handleViewportChange = () => updateOverlayPosition();
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    return () => {
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [compact, overlayOpen, updateOverlayPosition]);

  useEffect(() => () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
  }, []);

  return (
    <div
      ref={attachDragRef}
      onMouseEnter={compact ? openOverlay : undefined}
      onMouseLeave={compact ? scheduleCloseOverlay : undefined}
      className={[
        compact
          ? "group relative cursor-grab active:cursor-grabbing"
          : "group relative rounded-xl border shadow-sm transition cursor-grab active:cursor-grabbing",
        compact ? "space-y-1" : "space-y-3 p-3",
        compact ? "" : tone,
        isDragging ? "opacity-45" : "opacity-100",
      ].join(" ")}
    >
      {compact ? (
        <>
          <div
            className={[
              "flex items-center gap-2 rounded-lg px-2 py-0.5 transition",
              compactTone.row,
            ].join(" ")}
          >
            <span className={["h-3 w-3 shrink-0 rounded-full", compactTone.dot].join(" ")} />
            <div className="min-w-0 flex-1 truncate text-[14px] font-medium leading-5 text-slate-900">{job.plate}</div>
            <div className="flex shrink-0 items-center gap-1.5">
              <GripVertical className="h-3 w-3 text-slate-400" />
            </div>
          </div>
          {overlayOpen && overlayPosition && typeof document !== "undefined"
            ? createPortal(
                <div
                  onMouseEnter={openOverlay}
                  onMouseLeave={scheduleCloseOverlay}
                  className={[
                    "fixed z-[200] w-[360px] rounded-xl border p-3 shadow-2xl",
                    tone,
                  ].join(" ")}
                  style={{ top: overlayPosition.top, left: overlayPosition.left }}
                >
                  <WofDetailedCardContent
                    job={job}
                    onNzta={onNzta}
                    onStatusChange={onStatusChange}
                    statusUpdating={statusUpdating}
                  />
                </div>,
                document.body
              )
            : null}
        </>
      ) : (
        <WofDetailedCardContent
          job={job}
          onNzta={showNztaAction ? onNzta : undefined}
          onStatusChange={onStatusChange}
          statusUpdating={statusUpdating}
        />
      )}
    </div>
  );
}

function PlaceholderFields({
  value,
  onChange,
  compact = false,
}: {
  value: PlaceholderDraft;
  onChange: (next: PlaceholderDraft) => void;
  compact?: boolean;
}) {
  const inputClass = compact
    ? "h-8 rounded-md border border-sky-200 bg-white/95 px-2 text-xs text-slate-800 outline-none focus:border-sky-500"
    : "h-9 rounded-md border border-sky-200 bg-white/95 px-2 text-sm text-slate-800 outline-none focus:border-sky-500";
  const textareaClass = compact
    ? "min-h-[56px] rounded-md border border-sky-200 bg-white/95 px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-sky-500"
    : "min-h-[72px] rounded-md border border-sky-200 bg-white/95 px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-sky-500";

  return (
    <div className="grid gap-2" onMouseDown={(event) => event.stopPropagation()}>
      <input
        className={inputClass}
        value={value.rego}
        onChange={(event) => onChange({ ...value, rego: event.target.value })}
        placeholder="Rego（可选）"
      />
      <input
        className={inputClass}
        value={value.contact}
        onChange={(event) => onChange({ ...value, contact: event.target.value })}
        placeholder="联系人 / 电话（可选）"
      />
      <textarea
        className={textareaClass}
        value={value.notes}
        onChange={(event) => onChange({ ...value, notes: event.target.value })}
        placeholder="备注（可选）"
      />
    </div>
  );
}

function getPlaceholderLabel(value: PlaceholderDraft) {
  return value.rego.trim() || value.contact.trim() || "预约";
}

function WofPlaceholderCard({
  value,
  placeholderId,
  compact = false,
  isTemplate = false,
  onChange,
  onRemove,
  onCreateJob,
}: {
  value: PlaceholderDraft;
  placeholderId?: string;
  compact?: boolean;
  isTemplate?: boolean;
  onChange: (next: PlaceholderDraft) => void;
  onRemove?: () => void;
  onCreateJob?: () => void | Promise<void>;
}) {
  const dragRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayPosition, setOverlayPosition] = useState<{ top: number; left: number } | null>(null);
  const [{ isDragging }, drag] = useDrag(() => ({
    type: DRAG_TYPE,
    item: isTemplate
      ? ({ kind: "placeholder-template" } satisfies DragItem)
      : ({ kind: "placeholder", placeholderId: placeholderId ?? "" } satisfies DragItem),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [isTemplate, placeholderId]);
  const attachDragRef = useCallback((node: HTMLDivElement | null) => {
    dragRef.current = node;
    drag(node);
  }, [drag]);

  const updateOverlayPosition = useCallback(() => {
    if (!compact || !dragRef.current || typeof window === "undefined") return;
    const rect = dragRef.current.getBoundingClientRect();
    const overlayWidth = 360;
    const overlayHeight = 260;
    const gutter = 12;
    const left = rect.right + gutter + overlayWidth <= window.innerWidth
      ? rect.right + gutter
      : Math.max(16, rect.left - overlayWidth - gutter);
    const top = Math.min(
      Math.max(16, rect.top - 8),
      Math.max(16, window.innerHeight - overlayHeight - 16)
    );
    setOverlayPosition({ top, left });
  }, [compact]);

  const openOverlay = useCallback(() => {
    if (!compact) return;
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    updateOverlayPosition();
    setOverlayOpen(true);
  }, [compact, updateOverlayPosition]);

  const scheduleCloseOverlay = useCallback(() => {
    if (!compact) return;
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setOverlayOpen(false);
      closeTimerRef.current = null;
    }, 120);
  }, [compact]);

  useEffect(() => {
    if (!overlayOpen || !compact) return;
    const handleViewportChange = () => updateOverlayPosition();
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    return () => {
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [compact, overlayOpen, updateOverlayPosition]);

  useEffect(() => () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
  }, []);

  const renderHeader = (draggable: boolean) => (
    <div
      ref={draggable ? attachDragRef : undefined}
      className={[
        "flex items-start justify-between gap-3",
        draggable ? "cursor-grab active:cursor-grabbing" : "",
        compact ? "rounded-lg bg-sky-100 px-2 py-1" : "",
      ].join(" ")}
      onMouseEnter={compact && draggable ? openOverlay : undefined}
      onMouseLeave={compact && draggable ? scheduleCloseOverlay : undefined}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-sky-950">
          {getPlaceholderLabel(value)}
        </div>
        <div className="text-[11px] font-medium text-sky-700">
          {isTemplate ? "拖到日历生成新预约" : ""}
        </div>
      </div>
      <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
    </div>
  );

  if (compact) {
    return (
      <div className={isDragging ? "opacity-45" : "opacity-100"}>
        {renderHeader(true)}
        {overlayOpen && overlayPosition && typeof document !== "undefined"
          ? createPortal(
              <div
                onMouseEnter={openOverlay}
                onMouseLeave={scheduleCloseOverlay}
                className="fixed z-[200] w-[340px] space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-3 shadow-2xl"
                style={{ top: overlayPosition.top, left: overlayPosition.left }}
              >
                {renderHeader(false)}
                <PlaceholderFields value={value} onChange={onChange} compact />
                {onRemove || onCreateJob ? (
                  <div className="grid grid-cols-2 gap-2">
                    {onRemove ? (
                      <Button variant="ghost" className="h-8 border-sky-200 text-xs text-sky-800" onClick={onRemove}>
                        删除预约
                      </Button>
                    ) : null}
                    {onCreateJob ? (
                      <Button
                        variant="primary"
                        className="h-8 text-xs"
                        onClick={() => {
                          void onCreateJob();
                        }}
                      >
                        新工单
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>,
              document.body
            )
          : null}
      </div>
    );
  }

  return (
    <div
      className={[
        "space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-3 shadow-sm transition hover:border-sky-300",
        isDragging ? "opacity-45" : "opacity-100",
      ].join(" ")}
    >
      {renderHeader(true)}
      <PlaceholderFields value={value} onChange={onChange} />
      {onRemove || onCreateJob ? (
        <div className="grid grid-cols-2 gap-2">
          {onRemove ? (
            <Button variant="ghost" className="h-8 border-sky-200 text-xs text-sky-800" onClick={onRemove}>
              删除预约
            </Button>
          ) : null}
          {onCreateJob ? (
            <Button
              variant="primary"
              className="h-8 text-xs"
              onClick={() => {
                void onCreateJob();
              }}
            >
              新工单
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DropLane({
  title,
  subtitle,
  itemCount,
  onDropItem,
  children,
}: {
  title: string;
  subtitle: string;
  itemCount: number;
  onDropItem: (item: DragItem) => void;
  children?: React.ReactNode;
}) {
  const dropRef = useRef<HTMLDivElement | null>(null);
  const [{ isOver }, drop] = useDrop<DragItem, void, { isOver: boolean }>(() => ({
    accept: DRAG_TYPE,
    drop: (item) => onDropItem(item),
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
    }),
  }), [onDropItem]);
  const attachDropRef = useCallback((node: HTMLDivElement | null) => {
    dropRef.current = node;
    drop(node);
  }, [drop]);

  return (
    <Card className="flex h-full min-h-[760px] flex-col overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <div className="text-xs text-slate-500">{subtitle}</div>
          </div>
          <div className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
            {itemCount}
          </div>
        </div>
      </div>
      <div
        ref={attachDropRef}
        className={[
          "flex-1 space-y-3 overflow-y-auto px-4 py-4",
          isOver ? "bg-rose-50/60" : "bg-white",
        ].join(" ")}
      >
        {children}
        {itemCount === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Drag a car here.
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function ScheduleSlot({
  slotKey,
  hour,
  jobs,
  placeholders,
  onDropItem,
  showCurrentLine,
  currentLineOffsetPct,
  onNzta,
  onStatusChange,
  onPlaceholderChange,
  onPlaceholderRemove,
  onPlaceholderCreateJob,
  statusUpdatingId,
}: {
  slotKey: string;
  hour: number;
  jobs: WofScheduleJob[];
  placeholders: WofSchedulePlaceholder[];
  onDropItem: (item: DragItem, slotKey: string) => void;
  showCurrentLine: boolean;
  currentLineOffsetPct: number;
  onNzta: (job: WofScheduleJob) => void;
  onStatusChange: (jobId: string, next: "Todo" | "Checked") => void;
  onPlaceholderChange: (placeholderId: string, next: PlaceholderDraft) => void;
  onPlaceholderRemove: (placeholderId: string) => void;
  onPlaceholderCreateJob: (placeholder: WofSchedulePlaceholder) => void | Promise<void>;
  statusUpdatingId?: string | null;
}) {
  const dropRef = useRef<HTMLDivElement | null>(null);
  const [{ isOver }, drop] = useDrop<DragItem, void, { isOver: boolean }>(() => ({
    accept: DRAG_TYPE,
    drop: (item) => onDropItem(item, slotKey),
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
    }),
  }), [onDropItem, slotKey]);
  const attachDropRef = useCallback((node: HTMLDivElement | null) => {
    dropRef.current = node;
    drop(node);
  }, [drop]);

  return (
    <div
      ref={attachDropRef}
      className={[
        "relative h-full min-h-0 border-t border-slate-200 px-2 py-2 transition",
        isOver ? "bg-rose-50" : "bg-white",
      ].join(" ")}
    >
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {getSlotLabel(hour)}
      </div>
      <div className="h-[calc(100%-24px)] space-y-1 overflow-x-visible overflow-y-auto pr-1">
        {placeholders.map((placeholder) => (
          <WofPlaceholderCard
            key={placeholder.placeholderId}
            value={placeholder}
            placeholderId={placeholder.placeholderId}
            compact
            onChange={(next) => onPlaceholderChange(placeholder.placeholderId, next)}
            onRemove={() => onPlaceholderRemove(placeholder.placeholderId)}
            onCreateJob={() => {
              void onPlaceholderCreateJob(placeholder);
            }}
          />
        ))}
        {jobs.map((job) => (
          <WofJobCard
            key={job.jobId}
            job={job}
            compact
            showNztaAction={false}
            onNzta={() => onNzta(job)}
            onStatusChange={(next) => onStatusChange(job.jobId, next)}
            statusUpdating={statusUpdatingId === job.jobId}
          />
        ))}
      </div>
      {showCurrentLine ? (
        <div
          className="pointer-events-none absolute left-0 right-0 z-10"
          style={{ top: `${Math.max(0, Math.min(100, currentLineOffsetPct))}%` }}
        >
          <div className="relative border-t-2 border-rose-500">
            <span className="absolute -top-3 left-2 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
              Now
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function WofSchedulePage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<WofScheduleJob[]>([]);
  const [placeholders, setPlaceholders] = useState<WofSchedulePlaceholder[]>(() => loadPlaceholders());
  const [placeholderTemplate, setPlaceholderTemplate] = useState<PlaceholderDraft>({
    rego: "",
    contact: "",
    notes: "",
  });
  const [placements, setPlacements] = useState<PlacementMap>(() => loadPlacements());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const pendingPlacementsRef = useRef<PlacementMap | null>(null);
  const pendingPlaceholdersRef = useRef<WofSchedulePlaceholder[] | null>(null);
  const latestPlacementsRef = useRef<PlacementMap>(placements);
  const latestPlaceholdersRef = useRef<WofSchedulePlaceholder[]>(placeholders);
  const placementSaveTimerRef = useRef<number | null>(null);
  const placeholderSaveTimerRef = useRef<number | null>(null);
  const remoteSaveTimerRef = useRef<number | null>(null);
  const pendingRemoteSaveRef = useRef<{
    placements: PlacementMap;
    placeholders: WofSchedulePlaceholder[];
  } | null>(null);

  const saveRemoteSnapshot = useCallback(async (snapshot: {
    placements: PlacementMap;
    placeholders: WofSchedulePlaceholder[];
  }) => {
    try {
      await saveWofScheduleEntries(buildScheduleSaveEntries(snapshot.placements, snapshot.placeholders));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save WOF schedule.");
    }
  }, [toast]);

  const flushLocalScheduleSaves = useCallback(async () => {
    if (placementSaveTimerRef.current !== null) {
      window.clearTimeout(placementSaveTimerRef.current);
      placementSaveTimerRef.current = null;
    }
    if (placeholderSaveTimerRef.current !== null) {
      window.clearTimeout(placeholderSaveTimerRef.current);
      placeholderSaveTimerRef.current = null;
    }
    if (pendingPlacementsRef.current) {
      savePlacements(pendingPlacementsRef.current);
      pendingPlacementsRef.current = null;
    }
    if (pendingPlaceholdersRef.current) {
      savePlaceholders(pendingPlaceholdersRef.current);
      pendingPlaceholdersRef.current = null;
    }
    if (remoteSaveTimerRef.current !== null) {
      window.clearTimeout(remoteSaveTimerRef.current);
      remoteSaveTimerRef.current = null;
    }
    if (pendingRemoteSaveRef.current) {
      const snapshot = pendingRemoteSaveRef.current;
      pendingRemoteSaveRef.current = null;
      await saveRemoteSnapshot(snapshot);
    }
  }, [saveRemoteSnapshot]);

  const scheduleRemoteSave = useCallback((
    nextPlacements: PlacementMap,
    nextPlaceholders: WofSchedulePlaceholder[]
  ) => {
    pendingRemoteSaveRef.current = {
      placements: nextPlacements,
      placeholders: nextPlaceholders,
    };
    if (typeof window === "undefined") {
      void saveRemoteSnapshot(pendingRemoteSaveRef.current);
      pendingRemoteSaveRef.current = null;
      return;
    }
    if (remoteSaveTimerRef.current !== null) {
      window.clearTimeout(remoteSaveTimerRef.current);
    }
    remoteSaveTimerRef.current = window.setTimeout(() => {
      if (pendingRemoteSaveRef.current) {
        void saveRemoteSnapshot(pendingRemoteSaveRef.current);
        pendingRemoteSaveRef.current = null;
      }
      remoteSaveTimerRef.current = null;
    }, LOCAL_SAVE_DEBOUNCE_MS);
  }, [saveRemoteSnapshot]);

  const schedulePlacementsSave = useCallback((next: PlacementMap, syncRemote = true) => {
    latestPlacementsRef.current = next;
    pendingPlacementsRef.current = next;
    if (typeof window === "undefined") {
      savePlacements(next);
      pendingPlacementsRef.current = null;
      if (syncRemote) scheduleRemoteSave(next, latestPlaceholdersRef.current);
      return;
    }
    if (placementSaveTimerRef.current !== null) {
      window.clearTimeout(placementSaveTimerRef.current);
    }
    placementSaveTimerRef.current = window.setTimeout(() => {
      if (pendingPlacementsRef.current) {
        savePlacements(pendingPlacementsRef.current);
        pendingPlacementsRef.current = null;
      }
      placementSaveTimerRef.current = null;
    }, LOCAL_SAVE_DEBOUNCE_MS);
    if (syncRemote) scheduleRemoteSave(next, latestPlaceholdersRef.current);
  }, [scheduleRemoteSave]);

  const schedulePlaceholdersSave = useCallback((next: WofSchedulePlaceholder[], syncRemote = true) => {
    latestPlaceholdersRef.current = next;
    pendingPlaceholdersRef.current = next;
    if (typeof window === "undefined") {
      savePlaceholders(next);
      pendingPlaceholdersRef.current = null;
      if (syncRemote) scheduleRemoteSave(latestPlacementsRef.current, next);
      return;
    }
    if (placeholderSaveTimerRef.current !== null) {
      window.clearTimeout(placeholderSaveTimerRef.current);
    }
    placeholderSaveTimerRef.current = window.setTimeout(() => {
      if (pendingPlaceholdersRef.current) {
        savePlaceholders(pendingPlaceholdersRef.current);
        pendingPlaceholdersRef.current = null;
      }
      placeholderSaveTimerRef.current = null;
    }, LOCAL_SAVE_DEBOUNCE_MS);
    if (syncRemote) scheduleRemoteSave(latestPlacementsRef.current, next);
  }, [scheduleRemoteSave]);

  const changeWeekOffset = useCallback(async (delta: number) => {
    await flushLocalScheduleSaves();
    setWeekOffset((prev) => prev + delta);
  }, [flushLocalScheduleSaves]);

  const workingDays = useMemo(() => buildWorkingDays(weekOffset), [weekOffset]);
  const visibleSlotKeys = useMemo(
    () => new Set(workingDays.flatMap((day) => SLOT_HOURS.map((hour) => `${day.key}-${hour}`))),
    [workingDays]
  );

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(withApiBase("/api/jobs/wof-schedule"));
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load WOF schedule.");
      }
      const rows = Array.isArray(data?.jobs) ? (data.jobs as WofScheduleJob[]) : [];
      const scheduleEntries = Array.isArray(data?.scheduleEntries)
        ? (data.scheduleEntries as WofScheduleEntryResponse[])
        : null;
      setJobs(rows);
      if (scheduleEntries && scheduleEntries.length > 0) {
        const mapped = mapServerScheduleEntries(scheduleEntries);
        setPlaceholders(mapped.placeholders);
        schedulePlaceholdersSave(mapped.placeholders, false);
        setPlacements(mapped.placements);
        schedulePlacementsSave(mapped.placements, false);
      } else {
        setPlacements((prev) => {
          const validIds = new Set(rows.map((job) => job.jobId));
          const next = Object.fromEntries(
            Object.entries(prev).filter(([placementKey]) =>
              getPlaceholderIdFromPlacementKey(placementKey) || validIds.has(placementKey)
            )
          ) as PlacementMap;
          schedulePlacementsSave(next);
          return next;
        });
      }
    } catch (err) {
      setJobs([]);
      setError(err instanceof Error ? err.message : "Failed to load WOF schedule.");
    } finally {
      setLoading(false);
    }
  }, [schedulePlacementsSave, schedulePlaceholdersSave]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    const unsubscribe = subscribeWofScheduleRefresh(() => {
      void loadJobs();
    });
    return unsubscribe;
  }, [loadJobs]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handlePageHide = () => {
      void flushLocalScheduleSaves();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void flushLocalScheduleSaves();
      }
    };

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      void flushLocalScheduleSaves();
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [flushLocalScheduleSaves]);

  const syncGoogleSheet = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch(withApiBase("/api/wof-records/sync"), {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to sync WOF records from Google Sheet.");
      }

      await loadJobs();
      toast.success(
        `同步完成：新增 ${Number(data?.inserted ?? 0)} 条，更新 ${Number(data?.updated ?? 0)} 条，跳过 ${Number(data?.skipped ?? 0)} 条`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to sync WOF records from Google Sheet.");
    } finally {
      setSyncing(false);
    }
  }, [loadJobs, toast]);

  const handleStatusChange = useCallback(async (jobId: string, next: "Todo" | "Checked") => {
    setStatusUpdatingId(jobId);
    try {
      const res = await apiUpdateWofStatus(jobId, next);
      if (!res.ok) {
        throw new Error(res.error || "Failed to update WOF status.");
      }
      let nextJobsSnapshot: WofScheduleJob[] = [];
      setJobs((prev) => {
        const updated = prev.map((job) =>
          job.jobId === jobId
            ? {
                ...job,
                wofStatus: next,
              }
            : job
        );
        nextJobsSnapshot = updated;
        return updated;
      });
      setPlacements((prev) => {
        const normalized = enforceSingleCheckedPerSlot(prev, nextJobsSnapshot, next === "Checked" ? jobId : undefined);
        schedulePlacementsSave(normalized);
        return normalized;
      });
      notifyWofScheduleRefresh();
      notifyPaintBoardRefresh();
      toast.success(next === "Checked" ? "WOF 状态已改为检查完成" : "WOF 状态已改为待查");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update WOF status.");
    } finally {
      setStatusUpdatingId(null);
    }
  }, [schedulePlacementsSave, toast]);

  const updatePlaceholder = useCallback((placeholderId: string, nextDraft: PlaceholderDraft) => {
    setPlaceholders((prev) => {
      const next = prev.map((placeholder) =>
        placeholder.placeholderId === placeholderId
          ? { ...placeholder, ...nextDraft }
          : placeholder
      );
      schedulePlaceholdersSave(next);
      return next;
    });
  }, [schedulePlaceholdersSave]);

  const removePlaceholder = useCallback((placeholderId: string) => {
    const placementKey = getPlaceholderPlacementKey(placeholderId);
    setPlaceholders((prev) => {
      const next = prev.filter((placeholder) => placeholder.placeholderId !== placeholderId);
      schedulePlaceholdersSave(next);
      return next;
    });
    setPlacements((prev) => {
      const next = { ...prev };
      delete next[placementKey];
      schedulePlacementsSave(next);
      return next;
    });
  }, [schedulePlacementsSave, schedulePlaceholdersSave]);

  const createJobFromPlaceholder = useCallback(async (placeholder: WofSchedulePlaceholder) => {
    await flushLocalScheduleSaves();
    const params = new URLSearchParams();
    params.set("source", "wof-appointment");
    const rego = placeholder.rego.trim();
    const customerName = placeholder.contact.trim();
    const notesText = placeholder.notes.trim();
    if (rego) params.set("rego", rego);
    if (customerName) params.set("customerName", customerName);
    if (notesText) params.set("notes", notesText);
    navigate(`/jobs/new?${params.toString()}`);
  }, [flushLocalScheduleSaves, navigate]);

  const moveToBacklog = useCallback((item: DragItem) => {
    if (item.kind === "placeholder-template") return;
    const placementKey = item.kind === "placeholder"
      ? getPlaceholderPlacementKey(item.placeholderId)
      : item.jobId;
    setPlacements((prev) => {
      const next = { ...prev, [placementKey]: { kind: "backlog" } as Placement };
      schedulePlacementsSave(next);
      return next;
    });
  }, [schedulePlacementsSave]);

  const jobMap = useMemo(
    () => new Map(jobs.map((job) => [job.jobId, job])),
    [jobs]
  );

  const placeholderMap = useMemo(
    () => new Map(placeholders.map((placeholder) => [placeholder.placeholderId, placeholder])),
    [placeholders]
  );

  const moveToSlot = useCallback((item: DragItem, slotKey: string) => {
    if (item.kind === "placeholder-template") {
      const placeholder = createPlaceholderFromDraft(placeholderTemplate);
      const placementKey = getPlaceholderPlacementKey(placeholder.placeholderId);
      setPlaceholders((prev) => {
        const next = [...prev, placeholder];
        schedulePlaceholdersSave(next);
        return next;
      });
      setPlacements((prev) => {
        const next = { ...prev, [placementKey]: { kind: "slot", slotKey } as Placement };
        schedulePlacementsSave(next);
        return next;
      });
      return;
    }

    if (item.kind === "placeholder") {
      const placementKey = getPlaceholderPlacementKey(item.placeholderId);
      setPlacements((prev) => {
        const next = { ...prev, [placementKey]: { kind: "slot", slotKey } as Placement };
        schedulePlacementsSave(next);
        return next;
      });
      return;
    }

    const jobId = item.jobId;
    setPlacements((prev) => {
      const next = { ...prev };
      const movingJob = jobMap.get(jobId);
      const movingStatus = movingJob?.wofStatus ?? "Todo";

      if (movingStatus === "Checked") {
        for (const [existingJobId, placement] of Object.entries(prev)) {
          if (existingJobId === jobId) continue;
          if (placement.kind !== "slot" || placement.slotKey !== slotKey) continue;
          const existingJob = jobMap.get(existingJobId);
          if (existingJob?.wofStatus === "Checked") {
            next[existingJobId] = { kind: "backlog" };
          }
        }
      }

      next[jobId] = { kind: "slot", slotKey } as Placement;
      const normalized = enforceSingleCheckedPerSlot(next, jobs, movingStatus === "Checked" ? jobId : undefined);
      schedulePlacementsSave(normalized);
      return normalized;
    });
  }, [jobMap, jobs, placeholderTemplate, schedulePlacementsSave, schedulePlaceholdersSave]);

  const backlogJobs = useMemo(
    () =>
      jobs.filter((job) => {
        const placement = placements[job.jobId];
        return (
          !placement ||
          placement.kind === "backlog" ||
          placement.kind === "completed"
        );
      }),
    [jobs, placements]
  );

  const backlogPlaceholders = useMemo(
    () =>
      placeholders.filter((placeholder) => {
        const placement = placements[getPlaceholderPlacementKey(placeholder.placeholderId)];
        return (
          !placement ||
          placement.kind === "backlog" ||
          placement.kind === "completed"
        );
      }),
    [placeholders, placements]
  );

  const jobsBySlot = useMemo(() => {
    const map = new Map<string, WofScheduleJob[]>();
    for (const [jobId, placement] of Object.entries(placements)) {
      if (placement.kind !== "slot") continue;
      if (!visibleSlotKeys.has(placement.slotKey)) continue;
      const job = jobMap.get(jobId);
      if (!job) continue;
      const list = map.get(placement.slotKey) ?? [];
      list.push(job);
      map.set(placement.slotKey, list);
    }

    for (const [slotKey, list] of map.entries()) {
      list.sort((a, b) => {
        if (a.wofStatus === "Checked" && b.wofStatus !== "Checked") return -1;
        if (a.wofStatus !== "Checked" && b.wofStatus === "Checked") return 1;
        return a.jobId.localeCompare(b.jobId);
      });
      map.set(slotKey, list);
    }

    return map;
  }, [jobMap, placements, visibleSlotKeys]);

  const placeholdersBySlot = useMemo(() => {
    const map = new Map<string, WofSchedulePlaceholder[]>();
    for (const [placementKey, placement] of Object.entries(placements)) {
      if (placement.kind !== "slot") continue;
      if (!visibleSlotKeys.has(placement.slotKey)) continue;
      const placeholderId = getPlaceholderIdFromPlacementKey(placementKey);
      if (!placeholderId) continue;
      const placeholder = placeholderMap.get(placeholderId);
      if (!placeholder) continue;
      const list = map.get(placement.slotKey) ?? [];
      list.push(placeholder);
      map.set(placement.slotKey, list);
    }

    for (const [slotKey, list] of map.entries()) {
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      map.set(slotKey, list);
    }

    return map;
  }, [placeholderMap, placements, visibleSlotKeys]);

  const currentDayKey = useMemo(() => {
    const parts = new Intl.DateTimeFormat("en-NZ", {
      timeZone: "Pacific/Auckland",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }, [now]);

  const currentHours = now.getHours() + now.getMinutes() / 60;

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">WOF 排班表</h1>
          <p className="mt-1 text-sm text-slate-500">Loading schedule board…</p>
        </div>
      </div>
    );
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="mx-auto flex max-h-[1200px] max-w-[2000px] flex-col space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">WOF 排班表</h1>
            <p className="mt-1 text-sm text-slate-500">
              Drag WOF jobs from the backlog into the next 7 working days and update their inspection status as they move.
            </p>
          </div>
          <Button
            variant="ghost"
            leftIcon={<RefreshCcw className="h-4 w-4" />}
            onClick={syncGoogleSheet}
            disabled={syncing}
          >
            {syncing ? "同步中..." : "同步 Google Sheet"}
          </Button>
        </div>

        {error ? (
          <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>
        ) : null}

        {jobs.length === 0 ? (
          <Card className="border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
            No active WOF jobs are available right now. You can still use the blue appointment card for time holds.
          </Card>
        ) : null}

        <div className="grid min-h-[820px] grid-cols-[320px_minmax(0,1fr)] gap-6">
            <DropLane
              title="WOF 待办栏"
              subtitle=""
              itemCount={backlogJobs.length + backlogPlaceholders.length + 1}
              onDropItem={moveToBacklog}
            >
              <WofPlaceholderCard
                value={placeholderTemplate}
                isTemplate
                onChange={setPlaceholderTemplate}
              />
              {backlogPlaceholders.map((placeholder) => (
                <WofPlaceholderCard
                  key={placeholder.placeholderId}
                  value={placeholder}
                  placeholderId={placeholder.placeholderId}
                  onChange={(next) => updatePlaceholder(placeholder.placeholderId, next)}
                  onRemove={() => removePlaceholder(placeholder.placeholderId)}
                  onCreateJob={() => {
                    void createJobFromPlaceholder(placeholder);
                  }}
                />
              ))}
              {backlogJobs.map((job) => (
                <WofJobCard
                  key={job.jobId}
                  job={job}
                  onNzta={() => openNztaAndCopyVin(job.vin, toast)}
                  onStatusChange={(next) => handleStatusChange(job.jobId, next)}
                  statusUpdating={statusUpdatingId === job.jobId}
                  showNztaAction
                />
              ))}
            </DropLane>

            <Card className="overflow-hidden max-w-[2000px]">
              <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">7 个工作日</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <Clock3 className="h-3.5 w-3.5" />
                      08:00 - 18:00, one-hour scheduling blocks
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      className="h-8 px-2"
                      onClick={() => {
                        void changeWeekOffset(-1);
                      }}
                      title="Previous week"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                      {formatWeekRange(workingDays)}
                    </div>
                    <Button
                      variant="ghost"
                      className="h-8 px-2"
                      onClick={() => {
                        void changeWeekOffset(1);
                      }}
                      title="Next week"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                      Current time: {formatNzDateTime(now)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="grid min-w-[980px] grid-cols-7">
                  {workingDays.map((day) => (
                    <div key={day.key} className="border-r border-slate-200 last:border-r-0">
                      <div className="border-b border-slate-200 bg-white px-3 py-3">
                        <div className="text-sm font-semibold text-slate-900">{day.label}</div>
                        <div className="mt-1 text-xs text-slate-500">{day.shortDate}</div>
                      </div>
                      <div
                        className="grid"
                        style={{ gridTemplateRows: `repeat(${SLOT_HOURS.length}, minmax(0, 1fr))`, height: "930px" }}
                      >
                        {SLOT_HOURS.map((hour) => {
                          const slotKey = `${day.key}-${hour}`;
                          const showCurrentLine =
                            day.key === currentDayKey &&
                            currentHours >= hour &&
                            currentHours < hour + 1;
                          return (
                            <ScheduleSlot
                              key={slotKey}
                              slotKey={slotKey}
                              hour={hour}
                              jobs={jobsBySlot.get(slotKey) ?? []}
                            placeholders={placeholdersBySlot.get(slotKey) ?? []}
                            onDropItem={moveToSlot}
                            showCurrentLine={showCurrentLine}
                            currentLineOffsetPct={(currentHours - hour) * 100}
                            onNzta={(job) => openNztaAndCopyVin(job.vin, toast)}
                            onStatusChange={handleStatusChange}
                            onPlaceholderChange={updatePlaceholder}
                            onPlaceholderRemove={removePlaceholder}
                            onPlaceholderCreateJob={createJobFromPlaceholder}
                            statusUpdatingId={statusUpdatingId}
                          />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
        </div>
      </div>
    </DndProvider>
  );
}
