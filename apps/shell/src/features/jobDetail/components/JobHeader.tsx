import { Archive, Trash2, AlertCircle, Plus, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, TagPill, Textarea } from "@/components/ui";
import { XeroButton, getXeroInvoiceUrl } from "@/components/common/XeroButton";
import { JOB_DETAIL_TEXT } from "@/features/jobDetail/jobDetail.constants";
import type { TagOption } from "@/components/MultiTagSelect";
import { MultiTagSelect } from "@/components/MultiTagSelect";
import { formatJobDisplayId } from "@/utils/jobId";
import { useJobSheetPrinter } from "@/features/printing/useJobSheetPrinter";

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

  const saveTags = async () => {
    if (!onSaveTags) return;
    setTagMessage(null);
    setTagError(null);
    setSavingTags(true);
    const res = await onSaveTags(selectedTagIds);
    setSavingTags(false);
    if (res.success) {
      setTagMessage(res.message || "Label updated");
      setEditingTags(false);
    } else {
      setTagError(res.message || "Update failed");
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
      setNoteMessage(res.message || "Note has been updated");
      setEditingNote(false);
    } else {
      setNoteError(res.message || "Note update failed");
    }
  };

  const { print } = useJobSheetPrinter();

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
    print(type, row, noteDraft || notes);
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
    <div className="flex flex-col gap-4">
      <div className="flex w-full flex-wrap items-center gap-2 md:flex-nowrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-[var(--ds-text)]">{JOB_DETAIL_TEXT.labels.jobDetail}</h1>
          <p className="text-sm text-[var(--ds-muted)] mt-1">{formatJobDisplayId(jobId)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TagPill label={status} className={getStatusColor(status)} />
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
                <div className="text-sm font-semibold text-[rgba(0,0,0,0.72)] mb-2">Select tag</div> {tagMessage ? <div className="text-xs text-green-600 mb-2">{tagMessage}</div> : null}
                {tagError ? <div className="text-xs text-red-600 mb-2">{tagError}</div> : null}
                <MultiTagSelect
                  options={tagOptions}
                  value={selectedTagIds}
                  onChange={setSelectedTagIds}
                  placeholder="Select label"
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
            {isArchiving ? "Archiving..." : JOB_DETAIL_TEXT.buttons.archive}
          </Button>
          <Button
            leftIcon={<Trash2 className="w-4 h-4" />}
            className="border-red-300 text-red-700 hover:bg-red-50"onClick={onDelete} disabled={isDeleting} > Delete Job </Button> </div> </div> <div className="flex w-full flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className=" text-[rgba(0,0,0,0.55)] mb-1">Work order notes</div> {noteMessage? <div className="text-xs text-green-600 mb-1">{noteMessage}</div> : null}
          {noteError ? <div className="text-xs text-red-600 mb-1">{noteError}</div> : null}
          {editingNote ? (
            <>
              <Textarea 

                rows={3}
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder="Enter remark information"
              />
              <div className="mt-2 flex gap-2">
                <Button variant="primary"onClick={saveNotes} disabled={savingNote || !onSaveNotes}> save </Button> <Button onClick={() => { setNoteDraft(notes); setEditingNote(false); }} disabled={savingNote} > Cancel </Button> </div> </> ) : ( <div className="flex items-end gap-2">
              <div className="min-h-[72px] flex-1 whitespace-pre-wrap rounded-[8px] border border-[rgba(0,0,0,0.10)] bg-white px-3 py-2 text-sm text-[var(--ds-text)]">
                {noteDraft?.trim() ? noteDraft : "—"}
              </div>
              <button
                type="button"
                className=" mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(0,0,0,0.10)] text-[rgba(0,0,0,0.55)] hover:text-[rgba(0,0,0,0.8)] hover:bg-[rgba(0,0,0,0.04)]"
                title="Editor's Notes"
                onClick={() => setEditingNote(true)}
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-2 ml-40">
          <Button variant="primary"onClick={handlePaintClick}> spray paint printing </Button> <Button variant="primary" onClick={() => handlePrint("mech")}>Machine repair printing</Button>
          {externalInvoiceId ? (
            <XeroButton
              onClick={openXero}
              showIcon={false}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
