import { FileText, Image as ImageIcon, X } from "lucide-react";
import type { CourtesyCarAttachment } from "../courtesyCars.types";

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CourtesyCarAttachmentStrip({
  attachments,
  selectedId,
  onSelect,
  onRemove,
  compact = false,
}: {
  attachments: CourtesyCarAttachment[];
  selectedId?: string | null;
  onSelect?: (attachment: CourtesyCarAttachment) => void;
  onRemove?: (attachmentId: string) => void;
  compact?: boolean;
}) {
  if (attachments.length === 0) {
    return (
      <div className="flex min-h-[96px] items-center justify-center rounded-[16px] border border-dashed border-[rgba(0,0,0,0.12)] bg-[rgba(255,255,255,0.7)] text-sm text-[var(--ds-muted)]">
        暂无附件
      </div>
    );
  }

  return (
    <div className={compact ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-3"}>
      {attachments.map((attachment) => {
        const isImage = attachment.kind === "image" || attachment.mimeType.startsWith("image/");
        const selected = selectedId === attachment.id;

        return (
          <button
            key={attachment.id}
            type="button"
            onClick={() => onSelect?.(attachment)}
            className={[
              "group relative overflow-hidden rounded-[14px] border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
              selected ? "border-[var(--ds-primary)] ring-2 ring-[rgba(37,99,235,0.12)]" : "border-[rgba(0,0,0,0.08)]",
            ].join(" ")}
          >
            {isImage ? (
              <img src={attachment.dataUrl} alt={attachment.name} className={compact ? "h-24 w-full object-cover" : "h-32 w-full object-cover"} />
            ) : (
              <div className={compact ? "flex h-24 items-center justify-center bg-slate-50" : "flex h-32 items-center justify-center bg-slate-50"}>
                <div className="text-center">
                  <FileText className="mx-auto h-8 w-8 text-slate-400" />
                  <div className="mt-1 text-xs font-medium text-slate-600">{attachment.name}</div>
                </div>
              </div>
            )}
            <div className="flex items-start gap-2 p-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-slate-900">{attachment.name}</div>
                <div className="text-[11px] text-slate-500">
                  {attachment.kind === "image" ? "Image" : "File"} · {formatBytes(attachment.size)}
                </div>
              </div>
              {onRemove ? (
                <button
                  type="button"
                  className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(attachment.id);
                  }}
                  aria-label={`Remove ${attachment.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <div className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-600 shadow">
              {isImage ? <ImageIcon className="mr-1 inline h-3 w-3" /> : <FileText className="mr-1 inline h-3 w-3" />}
              {attachment.kind === "image" ? "Preview" : "File"}
            </div>
          </button>
        );
      })}
    </div>
  );
}

