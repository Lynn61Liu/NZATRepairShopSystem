import { Archive, Trash2, AlertCircle, Plus, Pencil } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, TagPill, Textarea } from "@/components/ui";
import { XeroButton, getXeroInvoiceUrl } from "@/components/common/XeroButton";
import { JOB_DETAIL_TEXT } from "@/features/jobDetail/jobDetail.constants";
import type { TagOption } from "@/components/MultiTagSelect";
import { MultiTagSelect } from "@/components/MultiTagSelect";
import { formatJobDisplayId } from "@/utils/jobId";
import { getDurationDays } from "@/features/paint/paintBoard.utils";
import { useJobSheetPrinter } from "@/features/printing/useJobSheetPrinter";
import { resolveJobSheetRouteKey } from "@/features/printing/silentPrint.routes";
import {
  createJobLightBinding,
  fetchJobLightBindings,
  lightOnJobLightBinding,
  type JobLightBindingResponse,
} from "@/features/jobDetail/api/jobDetailApi";

const LIGHT_TAG_PATTERN = /^AD1[0-9A-F]{9}$/;

function normalizeLightTagInput(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

interface JobHeaderProps {
  jobId: string;
  status: string;
  isUrgent: boolean;
  tags: string[];
  notes: string;
  createdAt?: string;
  vehiclePlate: string;
  vehicleModel?: string;
  customerName: string;
  customerCode?: string;
  customerPhone?: string;
  externalInvoiceId?: string;
  needsPo?: boolean;
  vin?: string | null;
  nzFirstRegistration?: string | null;
  paintPanels?: number | null;
  hasPaintService?: boolean;
  hasWofService?: boolean;
  onCreateXeroInvoice?: () => Promise<{ success: boolean; message?: string }>;
  isCreatingXeroInvoice?: boolean;
  onArchive?: () => Promise<{ success: boolean; message?: string }> | void;
  isArchiving?: boolean;
  onDelete?: () => void;
  isDeleting?: boolean;
  tagOptions?: TagOption[];
  onSaveTags?: (tagIds: string[]) => Promise<{ success: boolean; message?: string; tags?: string[] }>;
  onSaveNotes?: (notes: string) => Promise<{ success: boolean; message?: string }>;
  onCreatePaintService?: (status?: string, panels?: number) => Promise<{ success: boolean; message?: string }>;
}

export function JobHeader({
  jobId,
  status,
  isUrgent,
  tags,
  notes,
  createdAt,
  vehiclePlate,
  vehicleModel,
  customerName,
  customerCode,
  externalInvoiceId,
  vin,
  nzFirstRegistration,
  paintPanels,
  hasPaintService,
  hasWofService,
  onArchive,
  isArchiving,
  onDelete,
  isDeleting,
  tagOptions = [],
  onSaveTags,
  onSaveNotes,
  onCreatePaintService,
}: JobHeaderProps) {
  const [editingTags, setEditingTags] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagMessage, setTagMessage] = useState<string | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);
  const [savingTags, setSavingTags] = useState(false);
  const [noteDraft, setNoteDraft] = useState(notes);
  const [savingNote, setSavingNote] = useState(false);
  const [noteMessage, setNoteMessage] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState(false);
  const [bindDialogOpen, setBindDialogOpen] = useState(false);
  const [bindingTagInput, setBindingTagInput] = useState("");
  const [bindingSubmitting, setBindingSubmitting] = useState(false);
  const [bindingError, setBindingError] = useState<string | null>(null);
  const [bindingResult, setBindingResult] = useState<JobLightBindingResponse | null>(null);
  const [currentLightBinding, setCurrentLightBinding] = useState<JobLightBindingResponse | null>(null);
  const [lightCommandBusy, setLightCommandBusy] = useState(false);
  const [lightCommandMessage, setLightCommandMessage] = useState<string | null>(null);
  const [lightCommandError, setLightCommandError] = useState<string | null>(null);
  const bindingInputRef = useRef<HTMLInputElement | null>(null);

  const tagIdByLabel = useMemo(() => {
    const map = new Map<string, string>();
    tagOptions.forEach((opt) => {
      map.set(opt.label, opt.id);
    });
    return map;
  }, [tagOptions]);

  useEffect(() => {
    if (tagOptions.length === 0) return;
    const ids = tags.map((t) => tagIdByLabel.get(t)).filter(Boolean) as string[];
    setSelectedTagIds(ids);
  }, [tags, tagOptions, tagIdByLabel]);

  useEffect(() => {
    if (!tagMessage && !tagError) return;
    const timer = window.setTimeout(() => {
      setTagMessage(null);
      setTagError(null);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [tagMessage, tagError]);

  useEffect(() => {
    if (!editingNote) {
      setNoteDraft(notes);
    }
  }, [notes, editingNote]);

  useEffect(() => {
    if (!noteMessage && !noteError) return;
    const timer = window.setTimeout(() => {
      setNoteMessage(null);
      setNoteError(null);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [noteMessage, noteError]);

  useEffect(() => {
    if (!bindDialogOpen) return;
    const timer = window.setTimeout(() => bindingInputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [bindDialogOpen]);

  const refreshCurrentLightBinding = async () => {
    const res = await fetchJobLightBindings(jobId);
    if (!res.ok || !res.data) return;

    const active = res.data.find((item) => item.status === "Bound")
      ?? res.data.find((item) => item.status === "PendingBind")
      ?? null;
    setCurrentLightBinding(active);
  };

  useEffect(() => {
    void refreshCurrentLightBinding();
  }, [jobId]);

  const saveTags = async () => {
    if (!onSaveTags) return;
    setTagMessage(null);
    setTagError(null);
    setSavingTags(true);
    const res = await onSaveTags(selectedTagIds);
    setSavingTags(false);
    if (res.success) {
      setTagMessage(res.message || "已更新标签");
      setEditingTags(false);
    } else {
      setTagError(res.message || "更新失败");
    }
  };

  const saveNotes = async () => {
    if (!onSaveNotes) return;
    setNoteMessage(null);
    setNoteError(null);
    setSavingNote(true);
    const res = await onSaveNotes(noteDraft);
    setSavingNote(false);
    if (res.success) {
      setNoteMessage(res.message || "备注已更新");
      setEditingNote(false);
    } else {
      setNoteError(res.message || "备注更新失败");
    }
  };

  const { print } = useJobSheetPrinter({ printMode: "preview" });
  const inShopPill = useMemo(() => {
    if (!createdAt) return null;
    const days = getDurationDays(createdAt);
    if (!Number.isFinite(days)) return null;
    const variant: "danger" | "warning" | "neutral" = days >= 5 ? "danger" : days >= 3 ? "warning" : "neutral";
    return { label: `${days}天在店`, variant };
  }, [createdAt]);

  const handlePrint = (type: "mech" | "paint") => {
    const row = {
      plate: vehiclePlate,
      vehicleModel,
      customerCode,
      customerName,
      createdAt,
      panels: paintPanels ?? null,
      nzFirstRegistration: nzFirstRegistration ?? "",
      vin: vin ?? "",
    };
    const routeKey = type === "paint" ? "job-pnp" : resolveJobSheetRouteKey("mech", Boolean(hasWofService));
    print(type, row, noteDraft || notes, routeKey);
  };

  const handlePaintClick = async () => {
    if (!hasPaintService && onCreatePaintService) {
      await onCreatePaintService("not_started");
    }
    handlePrint("paint");
  };

  const openXero = () => {
    const url = getXeroInvoiceUrl(externalInvoiceId);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openBindDialog = () => {
    setBindingTagInput("");
    setBindingError(null);
    setBindingResult(null);
    setBindDialogOpen(true);
  };

  const closeBindDialog = () => {
    if (bindingSubmitting) return;
    setBindDialogOpen(false);
  };

  const waitForBindingResult = async (bindingId: number) => {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      const res = await fetchJobLightBindings(jobId);
      if (!res.ok || !res.data) continue;

      const binding = res.data.find((item) => item.id === bindingId);
      if (!binding) continue;

      setBindingResult(binding);
      if (binding.status === "Bound") {
        setCurrentLightBinding(binding);
        return;
      }
      if (binding.status === "BindFailed") {
        setBindingError(binding.failureReason || "绑定失败");
        return;
      }
    }

    setBindingError("绑定指令已发送，但暂未收到基站确认");
  };

  const submitLightBinding = async () => {
    const tagId = normalizeLightTagInput(bindingTagInput);
    setBindingTagInput(tagId);
    setBindingError(null);
    setBindingResult(null);

    if (!LIGHT_TAG_PATTERN.test(tagId)) {
      setBindingError("灯条码格式不正确");
      return;
    }

    setBindingSubmitting(true);
    const res = await createJobLightBinding(jobId, tagId);
    if (!res.ok || !res.data) {
      setBindingSubmitting(false);
      setBindingError(res.error || "绑定失败");
      return;
    }

    setBindingResult(res.data);
    setCurrentLightBinding(res.data);
    await waitForBindingResult(res.data.id);
    setBindingSubmitting(false);
  };

  const handleLightOnClick = async () => {
    if (!currentLightBinding || currentLightBinding.status !== "Bound") return;

    setLightCommandBusy(true);
    setLightCommandMessage(null);
    setLightCommandError(null);
    const res = await lightOnJobLightBinding(currentLightBinding.id);
    setLightCommandBusy(false);

    if (!res.ok) {
      setLightCommandError(res.error || "点亮失败");
      return;
    }

    if (res.data) setCurrentLightBinding(res.data);
    setLightCommandMessage("点亮命令已发送");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "In Shop":
        return "bg-[var(--ds-panel)] text-[var(--ds-primary)] border-[var(--ds-border)]";
      case "Completed":
        return "bg-[var(--ds-panel)] text-[var(--ds-text)] border-[var(--ds-border)]";
      case "Archived":
        return "bg-[var(--ds-panel)] text-[var(--ds-muted)] border-[var(--ds-border)]";
      default:
        return "bg-[var(--ds-panel)] text-[var(--ds-muted)] border-[var(--ds-border)]";
    }
  };

  return (
    <>
    <div className="flex flex-col gap-4">
      <div className="flex w-full flex-wrap items-center gap-2 md:flex-nowrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-[var(--ds-text)]">{JOB_DETAIL_TEXT.labels.jobDetail}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-sm text-[var(--ds-muted)]">{formatJobDisplayId(jobId, createdAt)}</p>
            {inShopPill ? (
              <TagPill
                label={inShopPill.label}
                variant={inShopPill.variant}
                className="whitespace-nowrap"
              />
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {status === "In Shop" ? null : <TagPill label={status} className={getStatusColor(status)} />}
          {isUrgent ? (
            <TagPill
              label={JOB_DETAIL_TEXT.labels.urgent}
              variant="danger"
              leftIcon={<AlertCircle className="w-4 h-4" />}
            />
          ) : null}
          {tags.map((tag) => (
            <TagPill key={tag} label={tag} variant="primary" />
          ))}
          <div className="relative">
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(0,0,0,0.10)] text-[rgba(0,0,0,0.55)] hover:text-[rgba(0,0,0,0.8)] hover:bg-[rgba(0,0,0,0.04)]"
              title="Add tags"
              onClick={() => setEditingTags((v) => !v)}
            >
              <Plus className="h-4 w-4" />
            </button>
            {editingTags ? (
              <div className="absolute left-0 top-full z-50 mt-2 w-[520px] max-w-[90vw] rounded-[12px] border border-[rgba(0,0,0,0.12)] bg-white p-3 shadow-lg">
                <div className="text-sm font-semibold text-[rgba(0,0,0,0.72)] mb-2">选择标签</div>
                {tagMessage ? <div className="text-xs text-green-600 mb-2">{tagMessage}</div> : null}
                {tagError ? <div className="text-xs text-red-600 mb-2">{tagError}</div> : null}
                <MultiTagSelect
                  options={tagOptions}
                  value={selectedTagIds}
                  onChange={setSelectedTagIds}
                  placeholder="选择标签"
                  maxChips={3}
                />
                <div className="mt-3 flex justify-end gap-2">
                  <Button onClick={() => setEditingTags(false)} disabled={savingTags}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={saveTags} disabled={savingTags}>
                    Save
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          <Button leftIcon={<Archive className="w-4 h-4" />} onClick={() => void onArchive?.()} disabled={isArchiving || status === "Archived"}>
            {isArchiving ? "归档中..." : JOB_DETAIL_TEXT.buttons.archive}
          </Button>
          <Button
            leftIcon={<Trash2 className="w-4 h-4" />}
            className="border-red-300 text-red-700 hover:bg-red-50"
            onClick={onDelete}
            disabled={isDeleting}
          >
            删除Job
          </Button>
        </div>
      </div>

      <div className="flex w-full flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className=" text-[rgba(0,0,0,0.55)] mb-1">工单备注</div>
          {noteMessage ? <div className="text-xs text-green-600 mb-1">{noteMessage}</div> : null}
          {noteError ? <div className="text-xs text-red-600 mb-1">{noteError}</div> : null}
          {editingNote ? (
            <>
              <Textarea 

                rows={3}
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder="输入备注信息"
              />
              <div className="mt-2 flex gap-2">
                <Button variant="primary" onClick={saveNotes} disabled={savingNote || !onSaveNotes}>
                  保存
                </Button>
                <Button
                  onClick={() => {
                    setNoteDraft(notes);
                    setEditingNote(false);
                  }}
                  disabled={savingNote}
                >
                  取消
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-end gap-2">
              <div className="min-h-[72px] flex-1 whitespace-pre-wrap rounded-[8px] border border-[rgba(0,0,0,0.10)] bg-white px-3 py-2 text-sm text-[var(--ds-text)]">
                {noteDraft?.trim() ? noteDraft : "—"}
              </div>
              <button
                type="button"
                className=" mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(0,0,0,0.10)] text-[rgba(0,0,0,0.55)] hover:text-[rgba(0,0,0,0.8)] hover:bg-[rgba(0,0,0,0.04)]"
                title="编辑备注"
                onClick={() => setEditingNote(true)}
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-col items-center gap-2 ml-40">
          {currentLightBinding?.status === "Bound" ? (
            <Button variant="primary" onClick={() => void handleLightOnClick()} disabled={lightCommandBusy}>
              {lightCommandBusy ? "发送中..." : "点亮"}
            </Button>
          ) : currentLightBinding ? (
            <Button variant="primary" disabled>
              {currentLightBinding.status}
            </Button>
          ) : (
            <Button variant="primary" onClick={openBindDialog}>
              绑定灯条
            </Button>
          )}
          {lightCommandMessage ? <div className="text-xs text-green-600">{lightCommandMessage}</div> : null}
          {lightCommandError ? <div className="text-xs text-red-600">{lightCommandError}</div> : null}
        </div>

        <div className="flex flex-col items-center gap-2 ml-40">
          <Button variant="primary" onClick={handlePaintClick}>
            喷漆打印
          </Button>
          <Button variant="primary" onClick={() => handlePrint("mech")}>
            机修打印
          </Button>
          {externalInvoiceId ? (
            <XeroButton
              onClick={openXero}
              showIcon={false}
            />
          ) : null}
        </div>
      </div>
    </div>
    {bindDialogOpen ? (
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 px-4"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeBindDialog();
        }}
      >
        <form
          className="w-full max-w-[420px] rounded-[8px] border border-[rgba(0,0,0,0.12)] bg-white p-5 shadow-xl"
          onSubmit={(event) => {
            event.preventDefault();
            void submitLightBinding();
          }}
        >
          <div className="text-lg font-semibold text-[var(--ds-text)]">绑定灯条</div>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[rgba(0,0,0,0.62)]">车牌号</span>
              <Input value={vehiclePlate || "—"} readOnly className="bg-[rgba(0,0,0,0.03)] font-semibold" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[rgba(0,0,0,0.62)]">灯条码</span>
              <Input
                ref={bindingInputRef}
                value={bindingTagInput}
                onChange={(event) => {
                  setBindingTagInput(normalizeLightTagInput(event.target.value));
                  setBindingError(null);
                }}
                placeholder="扫描或输入灯条码"
                disabled={bindingSubmitting}
              />
            </label>
          </div>

          {bindingResult ? (
            <div className="mt-4 rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[rgba(0,0,0,0.025)] px-3 py-2 text-sm text-[var(--ds-text)]">
              <div>状态：{bindingResult.status}</div>
              <div>灯条码：{bindingResult.tagId}</div>
              <div>基站：{bindingResult.stationId}</div>
              <div>Group：{bindingResult.groupNo}</div>
            </div>
          ) : null}

          {bindingError ? <div className="mt-3 text-sm text-red-600">{bindingError}</div> : null}
          {bindingSubmitting && !bindingError ? (
            <div className="mt-3 text-sm text-[rgba(0,0,0,0.62)]">绑定指令已发送，等待基站确认...</div>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={closeBindDialog} disabled={bindingSubmitting}>
              取消
            </Button>
            <Button variant="primary" type="submit" disabled={bindingSubmitting}>
              {bindingSubmitting ? "确认中..." : "确认"}
            </Button>
          </div>
        </form>
      </div>
    ) : null}
    </>
  );
}
