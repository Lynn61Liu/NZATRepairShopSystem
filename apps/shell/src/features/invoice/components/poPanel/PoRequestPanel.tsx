import { useEffect, useMemo, useState, useRef, type ClipboardEvent, type DragEvent, type MouseEvent, type ReactNode } from "react";
import { ChevronDown, Clock3, FileSearch, MailCheck, MessageSquareText, Paperclip, Send, Settings2, X } from "lucide-react";
import { Button, Card, Input, Select, Textarea } from "@/components/ui";
import { buildSharedEmailSignatureHtml } from "@/features/email/emailSignature";
import { withApiBase } from "@/utils/api";
import { PoDetectionPanel } from "./PoDetectionPanel";
import { StatusBadge } from "./StatusBadge";
import type { EmailState, EmailTimelineEvent, InvoiceItem, MerchantEmailRecipient, PoDetection } from "../../types";

const PO_REQUEST_SEND_LOCK_PREFIX = "po-request-send-lock:";
const DEFAULT_DRAFT_IMAGE_WIDTH = 360;
const MIN_DRAFT_IMAGE_WIDTH = 120;
const MAX_DRAFT_IMAGE_WIDTH = 720;

function getPoRequestSendLockExpiration(correlationId: string) {
  if (typeof window === "undefined") return null;
  const normalizedCorrelationId = correlationId.trim();
  if (!normalizedCorrelationId) return null;

  try {
    const raw = window.localStorage.getItem(getPoRequestSendLockKey(normalizedCorrelationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { expiresAt?: string };
    const expiresAtMs = parsed.expiresAt ? Date.parse(parsed.expiresAt) : Number.NaN;
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      window.localStorage.removeItem(getPoRequestSendLockKey(normalizedCorrelationId));
      return null;
    }
    return expiresAtMs;
  } catch {
    window.localStorage.removeItem(getPoRequestSendLockKey(normalizedCorrelationId));
    return null;
  }
}

function getPoRequestSendLockKey(correlationId: string) {
  return `${PO_REQUEST_SEND_LOCK_PREFIX}${correlationId.trim()}`;
}

function formatSendLockRemaining(expiresAtMs: number | null) {
  if (!expiresAtMs) return "";
  const remainingMs = Math.max(0, expiresAtMs - Date.now());
  const totalMinutes = Math.ceil(remainingMs / 60000);
  return totalMinutes <= 1 ? "1 minute" : `${totalMinutes} minutes`;
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getImageFilesFromList(files: FileList | null | undefined) {
  if (!files) return [];
  return Array.from(files).filter((file) => file.type.startsWith("image/"));
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read image."));
    reader.readAsDataURL(file);
  });
}

function buildDraftImageHtml(src: string, name: string, width = DEFAULT_DRAFT_IMAGE_WIDTH) {
  return `<img src="${src}" alt="${escapeHtmlAttribute(name)}" data-po-draft-image="true" style="display:block; width:${width}px; max-width:100%; height:auto; margin:8px 0; border-radius:8px;" />`;
}

function normalizeDraftEditorImages(editor: HTMLDivElement | null) {
  if (!editor) return;
  editor.querySelectorAll("img").forEach((image) => {
    image.setAttribute("data-po-draft-image", "true");
    image.style.maxWidth = "100%";
    image.style.height = "auto";
    image.style.borderRadius = image.style.borderRadius || "8px";
    if (!image.style.width && image.naturalWidth > DEFAULT_DRAFT_IMAGE_WIDTH) {
      image.style.width = `${DEFAULT_DRAFT_IMAGE_WIDTH}px`;
    }
  });
}

type Props = {
  merchantEmailRecipients: MerchantEmailRecipient[];
  selectedMerchantEmail: string;
  correlationId: string;
  vehicleRego: string;
  // 【新增并修改】加回了年份，加上问号表示它是可选的，这样就算外部没传也不会报错
  vehicleYear: string; 
  vehicleModel: string;
  vehicleMake: string;
  snapshotTotal: number;
  items: InvoiceItem[];
  emailStates: EmailState[];
  timelineEvents: EmailTimelineEvent[];
  detections: PoDetection[];
  selectedDetectionId: string | null;
  manualPoNumber: string;
  currentInvoiceReference: string;
  hasConfirmedPo: boolean;
  readOnly: boolean;
  readOnlyReason?: string;
  externalSendDetected?: boolean;
  draftSendBlockedReason?: string;
  onSendRequest: (payload: { to: string; subject: string; body: string }) => Promise<void>;
  onSelectDetection: (id: string) => void;
  onConfirmDetection: (id: string) => void;
  onManualPoNumberChange: (value: string) => void;
  onSyncManualPoToReference: () => void;
};

export function PoRequestPanel({
  merchantEmailRecipients,
  selectedMerchantEmail,
  correlationId,
  vehicleRego,
  vehicleYear, // 【新增】接收年份
  vehicleModel,
  vehicleMake,
  snapshotTotal,
  items,
  timelineEvents,
  detections,
  selectedDetectionId,
  manualPoNumber,
  currentInvoiceReference,
  hasConfirmedPo,
  readOnly,
  readOnlyReason,
  externalSendDetected,
  draftSendBlockedReason,
  onSendRequest,
  onSelectDetection,
  onConfirmDetection,
  onManualPoNumberChange,
  onSyncManualPoToReference,
}: Props) {
  const stateMeta: Record<string, ReactNode> = {
    Draft: <MailCheck className="h-4 w-4 text-slate-500" />,
    Sent: <Send className="h-4 w-4 text-emerald-600" />,
    "Follow Up 1": <Clock3 className="h-4 w-4 text-amber-600" />,
    "Follow Up 2": <Clock3 className="h-4 w-4 text-amber-600" />,
    "Follow Up 3": <Clock3 className="h-4 w-4 text-amber-600" />,
    "Get Reply": <MailCheck className="h-4 w-4 text-sky-600" />,
    "Get PO": <FileSearch className="h-4 w-4 text-violet-600" />,
    "Escalation Required": <Clock3 className="h-4 w-4 text-rose-600" />,
    "PO Confirmed": <MailCheck className="h-4 w-4 text-emerald-700" />,
  };

  const recipientOptions = useMemo(() => {
    const hasBusiness = merchantEmailRecipients.some((item) => item.kind === "business");
    if (hasBusiness) return merchantEmailRecipients;
    return [
      ...merchantEmailRecipients,
      {
        email: selectedMerchantEmail,
        kind: "business" as const,
        name: "Team",
        title: "",
      },
    ];
  }, [merchantEmailRecipients, selectedMerchantEmail]);

  // 【修改】按你的要求调整顺序，加上年份，并且去掉了 from NZAT
  const vehicleLabel = useMemo(
    () => `${[vehicleRego, vehicleYear, vehicleMake, vehicleModel].filter(Boolean).join(" ")}`,
    [vehicleRego, vehicleYear, vehicleMake, vehicleModel]
  );

  const defaultSubject = useMemo(
    () => `PO Request for ${vehicleLabel} [${correlationId}]`,
    [correlationId, vehicleLabel]
  );

  const [to, setTo] = useState(selectedMerchantEmail);
  const selectedEmails = useMemo(
    () =>
      to
        .split(/[,\n;]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    [to]
  );
  
  const normalizedToValue = useMemo(() => selectedEmails.join(", "), [selectedEmails]);
  
  const selectedRecipient = useMemo(
    () => recipientOptions.find((item) => item.email === selectedEmails[0]) ?? recipientOptions[0],
    [recipientOptions, selectedEmails]
  );
  
  const greetingName =
    selectedEmails.length === 1 && selectedRecipient?.kind === "staff" && selectedRecipient.name.trim()
      ? selectedRecipient.name.trim()
      : "Team";

  // 【修改】正文模板，保留了空行，完美排版，加入了年份
  const defaultBody = useMemo(() => {
    const itemsHtml = items
      .map(
        (item) => `
        <tr>
          <td style="padding: 4px 12px 4px 0; text-align: left; vertical-align: top;">${item.description}</td>
          <td style="padding: 4px 0 4px 0; text-align: right; vertical-align: top; width: 120px; white-space: nowrap;">$${item.unitPrice.toFixed(2)}</td>
        </tr>
      `
      )
      .join("");

    return `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
        <div style="margin-bottom: 20px;">Hi ${greetingName},</div>
        <div style="margin-bottom: 20px;">Could you please issue a PO number for the jobs on the vehicle below? Much appreciated.</div>
        
        <div style="margin-bottom: 8px;">
          <div style="margin-bottom: 6px;"><strong>- Rego:</strong> ${vehicleRego || ""}</div>
          <div style="margin-bottom: 6px;"><strong>- Make & Model:</strong> ${[vehicleYear, vehicleMake, vehicleModel].filter(Boolean).join(" ")}</div>
          <div style="margin-bottom: 6px;"><strong>- Total Amount:</strong> $${snapshotTotal.toFixed(2)}</div>
          <div style="margin-bottom: 6px;"><strong>- Job Details:</strong></div>
        </div>
        
        <table style="width: 100%; max-width: 600px; border-collapse: collapse; margin-bottom: 30px;">
          ${itemsHtml}
        </table>
        
        ${buildSharedEmailSignatureHtml()}
      </div>
    `;
  }, [greetingName, vehicleRego, vehicleYear, vehicleMake, vehicleModel, snapshotTotal, items]);

  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [quickAddRecipient, setQuickAddRecipient] = useState("");
  const [lastSentPayload, setLastSentPayload] = useState<{ to: string; subject: string; body: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"compose" | "thread" | "detection">("compose");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<{ fileName: string; mimeType: string; url: string } | null>(null);
  const [sendLockExpiresAt, setSendLockExpiresAt] = useState<number | null>(() => getPoRequestSendLockExpiration(correlationId));
  const [selectedDraftImageActive, setSelectedDraftImageActive] = useState(false);
  const [selectedDraftImageWidth, setSelectedDraftImageWidth] = useState(DEFAULT_DRAFT_IMAGE_WIDTH);

  const editorRef = useRef<HTMLDivElement>(null);
  const selectedDraftImageRef = useRef<HTMLImageElement | null>(null);

  const threadEvents = useMemo(
    () => timelineEvents.filter((event) => ["sent", "reminder", "reply"].includes(event.type)),
    [timelineEvents]
  );
  
  const stateRounds = useMemo(() => {
    type FlowStep = { key: string; label: string };
    const rounds: FlowStep[][] = [];

    if (threadEvents.length === 0) {
      if (hasConfirmedPo) {
        rounds.push([{ key: "confirmed-only", label: "PO Confirmed" }]);
      }
      return rounds;
    }

    const orderedEvents = [...threadEvents].reverse();
    let currentRound: FlowStep[] = [];
    let followUpCount = 0;

    const flushCurrentRound = (closeWithEscalation: boolean) => {
      if (currentRound.length === 0) return;
      if (closeWithEscalation && followUpCount >= 2) {
        currentRound = [
          ...currentRound,
          {
            key: `round-${rounds.length + 1}-escalation`,
            label: "Escalation Required",
          },
        ];
      }
      rounds.push(currentRound);
      currentRound = [];
      followUpCount = 0;
    };

    for (const event of orderedEvents) {
      if (event.type === "sent") {
        flushCurrentRound(false);
        currentRound = [{ key: `${event.id}-sent`, label: "Sent" }];
        continue;
      }

      if (event.type === "reminder") {
        if (currentRound.length === 0) {
          currentRound = [{ key: `${event.id}-sent-fallback`, label: "Sent" }];
        }
        followUpCount += 1;
        currentRound = [
          ...currentRound,
          {
            key: `${event.id}-followup-${followUpCount}`,
            label: `Follow Up ${followUpCount}`,
          },
        ];
        continue;
      }

      if (currentRound.length === 0) {
        currentRound = [{ key: `${event.id}-reply-start`, label: "Get Reply" }];
      } else {
        currentRound = [...currentRound, { key: `${event.id}-reply`, label: "Get Reply" }];
      }

      if (event.detectedPoNumber) {
        currentRound = [...currentRound, { key: `${event.id}-po`, label: "Get PO" }];
      }

      flushCurrentRound(false);
    }

    flushCurrentRound(true);

    if (hasConfirmedPo) {
      if (rounds.length === 0) {
        rounds.push([{ key: "confirmed-only", label: "PO Confirmed" }]);
      } else {
        const lastRoundIndex = rounds.length - 1;
        rounds[lastRoundIndex] = [
          ...rounds[lastRoundIndex],
          { key: "po-confirmed", label: "PO Confirmed" },
        ];
      }
    }

    return rounds;
  }, [threadEvents, hasConfirmedPo]);

  const flattenedStateSteps = useMemo(
    () =>
      stateRounds.flatMap((round, roundIndex) =>
        round.map((item, index) => ({
          ...item,
          showConnector:
            index < round.length - 1 || roundIndex < stateRounds.length - 1,
        }))
      ),
    [stateRounds]
  );

  const supplierReplyCount = threadEvents.filter((event) => event.type === "reply").length;
  const lastThreadTimestamp = threadEvents[0]?.timestamp ?? "暂无记录";
  const latestThreadEvent = threadEvents[0];
  const isDraftRound = threadEvents.length === 0;

  useEffect(() => {
    setTo(selectedMerchantEmail);
  }, [selectedMerchantEmail]);

  useEffect(() => {
    if (isDraftRound) {
      setSubject(defaultSubject);
      return;
    }
    
    const trimmed = latestThreadEvent?.subject?.trim() || defaultSubject;
    const replySubject = /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
    setSubject(replySubject);
  }, [defaultSubject, isDraftRound, latestThreadEvent?.subject]);

  useEffect(() => {
    setBody(defaultBody);
  }, [defaultBody]);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== body) {
      editorRef.current.innerHTML = body;
      normalizeDraftEditorImages(editorRef.current);
    }
  }, [body]);

  useEffect(() => {
    setSendLockExpiresAt(getPoRequestSendLockExpiration(correlationId));

    if (typeof window === "undefined") return;

    const syncLock = (event?: StorageEvent) => {
      if (event?.key && event.key !== getPoRequestSendLockKey(correlationId)) return;
      setSendLockExpiresAt(getPoRequestSendLockExpiration(correlationId));
    };

    window.addEventListener("storage", syncLock);
    const intervalId = window.setInterval(() => {
      setSendLockExpiresAt(getPoRequestSendLockExpiration(correlationId));
    }, 30000);

    return () => {
      window.removeEventListener("storage", syncLock);
      window.clearInterval(intervalId);
    };
  }, [correlationId]);

  const isModified = to !== selectedMerchantEmail || subject !== defaultSubject || body !== defaultBody;
  const isCurrentPayloadSent =
    lastSentPayload?.to === to && lastSentPayload?.subject === subject && lastSentPayload?.body === body;
  const draftSendLocked = isDraftRound && sendLockExpiresAt !== null;
  const sendLockHint = formatSendLockRemaining(sendLockExpiresAt);
  const draftSendBlocked = isDraftRound && !readOnly && Boolean(draftSendBlockedReason);

  const sendDisabled = readOnly || sending || draftSendLocked || draftSendBlocked || Boolean(isCurrentPayloadSent && !isModified);

  const handleSend = async () => {
    const payload = { to: normalizedToValue, subject, body };
    setSending(true);
    try {
      await onSendRequest(payload);
      setSendLockExpiresAt(getPoRequestSendLockExpiration(correlationId));
      setLastSentPayload(payload);
      setTo(normalizedToValue);
      setBody("");
    } catch (error) {
      setSendLockExpiresAt(getPoRequestSendLockExpiration(correlationId));
      throw error;
    } finally {
      setSending(false);
    }
  };

  const handleCancel = () => {
    setTo(selectedMerchantEmail);
    setSubject(defaultSubject);
    setBody(defaultBody);
    setQuickAddRecipient("");
  };

  const appendRecipient = (email: string) => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) return;
    const nextRecipients = Array.from(new Set([...selectedEmails, normalizedEmail]));
    setTo(nextRecipients.join(", "));
  };

  const removeRecipient = (email: string) => {
    setTo(selectedEmails.filter((item) => item.toLowerCase() !== email.toLowerCase()).join(", "));
  };

  const extractEmailAddress = (value: string | undefined) => {
    if (!value) return "";
    const angleMatch = value.match(/<([^>]+)>/);
    if (angleMatch?.[1]) return angleMatch[1].trim();
    const emailMatch = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return emailMatch?.[0]?.trim() || value.trim();
  };

  const handleReplyInThread = () => {
    const replyTarget =
      latestThreadEvent?.type === "reply"
        ? extractEmailAddress(latestThreadEvent.from) || selectedMerchantEmail
        : extractEmailAddress(latestThreadEvent?.to) || selectedMerchantEmail;
        
    const trimmed = latestThreadEvent?.subject?.trim() || defaultSubject;
    const replySubject = /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;

    setTo(replyTarget);
    setSubject(replySubject);
    setBody("");
    setQuickAddRecipient("");
    setActiveTab("compose");
  };

  const syncBodyFromEditor = () => {
    normalizeDraftEditorImages(editorRef.current);
    setBody(editorRef.current?.innerHTML ?? "");
  };

  const insertHtmlIntoEditor = (html: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) {
      editor.insertAdjacentHTML("beforeend", html);
      syncBodyFromEditor();
      return;
    }

    const range = selection.getRangeAt(0);
    range.deleteContents();
    const template = document.createElement("template");
    template.innerHTML = html;
    const fragment = template.content;
    const lastNode = fragment.lastChild;
    range.insertNode(fragment);
    if (lastNode) {
      range.setStartAfter(lastNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    syncBodyFromEditor();
  };

  const insertImageFilesIntoEditor = async (files: File[]) => {
    for (const file of files) {
      const dataUrl = await readFileAsDataUrl(file);
      insertHtmlIntoEditor(buildDraftImageHtml(dataUrl, file.name || "Pasted image"));
    }
  };

  const handleEditorPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const imageFiles = getImageFilesFromList(event.clipboardData?.files);
    if (imageFiles.length === 0) {
      window.setTimeout(syncBodyFromEditor, 0);
      return;
    }

    event.preventDefault();
    void insertImageFilesIntoEditor(imageFiles).catch(() => undefined);
  };

  const handleEditorDrop = (event: DragEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const imageFiles = getImageFilesFromList(event.dataTransfer?.files);
    if (imageFiles.length === 0) return;

    event.preventDefault();
    void insertImageFilesIntoEditor(imageFiles).catch(() => undefined);
  };

  const handleEditorClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement) || !editorRef.current?.contains(target)) {
      selectedDraftImageRef.current = null;
      setSelectedDraftImageActive(false);
      return;
    }

    selectedDraftImageRef.current = target;
    setSelectedDraftImageActive(true);
    const parsedWidth = Number.parseInt(target.style.width || String(target.width), 10);
    setSelectedDraftImageWidth(
      Number.isFinite(parsedWidth)
        ? Math.max(MIN_DRAFT_IMAGE_WIDTH, Math.min(MAX_DRAFT_IMAGE_WIDTH, parsedWidth))
        : DEFAULT_DRAFT_IMAGE_WIDTH
    );
  };

  const resizeSelectedDraftImage = (width: number) => {
    const image = selectedDraftImageRef.current;
    if (!image) return;
    const clamped = Math.max(MIN_DRAFT_IMAGE_WIDTH, Math.min(MAX_DRAFT_IMAGE_WIDTH, width));
    image.style.width = `${clamped}px`;
    image.style.maxWidth = "100%";
    image.style.height = "auto";
    setSelectedDraftImageWidth(clamped);
    syncBodyFromEditor();
  };

  const canInlinePreview = (mimeType: string) =>
    mimeType.startsWith("image/") || mimeType === "application/pdf";

  const buildAttachmentHref = (
    event: EmailTimelineEvent,
    attachment: NonNullable<EmailTimelineEvent["attachments"]>[number],
    inline: boolean
  ) => {
    if (!attachment.attachmentId) return "#";
    return withApiBase(
      `/api/gmail/attachment?${new URLSearchParams({
        messageId: event.id,
        attachmentId: attachment.attachmentId,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        inline: inline ? "true" : "false",
      }).toString()}`
    );
  };

  return (
    <>
      <Card className="rounded-[18px] p-6">
      {readOnly ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {readOnlyReason || "PO Request is locked for this job."}
        </div>
      ) : null}
      {!readOnly && externalSendDetected ? (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Detected external send from Gmail. System draft send is disabled for this PO thread.
        </div>
      ) : null}

      <div className={`${readOnly ? "mt-4" : "mt-6"} space-y-3`}>
        {stateRounds.length === 0 ? (
          <div className="flex items-center gap-2">
            {stateMeta.Draft ?? <MailCheck className="h-4 w-4 text-slate-500" />}
            <StatusBadge kind="state" value="Draft" />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {flattenedStateSteps.map((item) => (
              <div key={item.key} className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  {stateMeta[item.label] ?? <MailCheck className="h-4 w-4 text-slate-500" />}
                  <StatusBadge kind="state" value={item.label} />
                </div>
                {item.showConnector ? (
                  <span className="px-1 text-xs font-semibold text-slate-400">------</span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
        <div className="flex flex-wrap border-b border-slate-200 bg-white">
          <button
            type="button"
            className={`inline-flex items-center gap-2 px-5 py-3 font-sans text-sm font-medium transition ${
              activeTab === "compose"
                ? "border-b-2 border-sky-500 text-sky-700"
                : "border-b-2 border-transparent text-slate-500 hover:text-slate-700"
            }`}
            onClick={() => setActiveTab("compose")}
          >
            <Settings2 className="h-4 w-4" />
            写邮件
          </button>
          <button
            type="button"
            className={`inline-flex items-center gap-2 px-5 py-3 font-sans text-sm font-medium transition ${
              activeTab === "thread"
                ? "border-b-2 border-sky-500 text-sky-700"
                : "border-b-2 border-transparent text-slate-500 hover:text-slate-700"
            }`}
            onClick={() => setActiveTab("thread")}
          >
            <MessageSquareText className="h-4 w-4" />
            来往信息
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">
              {threadEvents.length}
            </span>
          </button>
          <button
            type="button"
            className={`inline-flex items-center gap-2 px-5 py-3 font-sans text-sm font-medium transition ${
              activeTab === "detection"
                ? "border-b-2 border-sky-500 text-sky-700"
                : "border-b-2 border-transparent text-slate-500 hover:text-slate-700"
            }`}
            onClick={() => setActiveTab("detection")}
          >
            PO Detection
          </button>
        </div>

        <div className="bg-slate-50 p-5">
          {activeTab === "compose" ? (
            <div className="space-y-3 text-sm text-slate-600">
              <div>
                <div className="mb-1 font-semibold text-slate-900">To</div>
                <Textarea
                  rows={2}
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  placeholder="输入一个或多个邮箱，使用逗号分隔"
                  disabled={readOnly}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedEmails.map((email) => (
                    <button
                      key={email}
                      type="button"
                      onClick={() => removeRecipient(email)}
                      disabled={readOnly}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-300"
                    >
                      <span>{email}</span>
                      <X className="h-3 w-3" />
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Select
                    value={quickAddRecipient}
                    onChange={(event) => {
                      if (readOnly) return;
                      const nextValue = event.target.value;
                      if (nextValue) {
                        appendRecipient(nextValue);
                      }
                      setQuickAddRecipient("");
                    }}
                    disabled={readOnly}
                  >
                    <option value="">快速添加商户 / staff 邮箱</option>
                    {recipientOptions.map((recipient) => (
                      <option key={`${recipient.email}-${recipient.kind}`} value={recipient.email}>
                        {recipient.email}{" "}
                        ({recipient.kind === "staff" ? `${recipient.name || "staff"} - ${recipient.title || "-"}` : "team"})
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div>
                <div className="mb-1 font-semibold text-slate-900">Subject</div>
                <Input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  disabled={readOnly || !isDraftRound}
                />
              </div>
              <div>
                <div className="mb-1 font-semibold text-slate-900">正文</div>
                <div
                  ref={editorRef}
                  contentEditable={!readOnly}
                  className={`min-h-[280px] w-full overflow-auto rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md [&_table]:max-w-full ${readOnly ? "cursor-not-allowed opacity-50" : ""}`}
                  onInput={syncBodyFromEditor}
                  onPaste={handleEditorPaste}
                  onDrop={handleEditorDrop}
                  onDragOver={(event) => {
                    if (!readOnly) {
                      event.preventDefault();
                    }
                  }}
                  onClick={handleEditorClick}
                />
                {selectedDraftImageActive ? (
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                    <span className="shrink-0 font-medium text-slate-700">图片宽度</span>
                    <input
                      type="range"
                      min={MIN_DRAFT_IMAGE_WIDTH}
                      max={MAX_DRAFT_IMAGE_WIDTH}
                      value={selectedDraftImageWidth}
                      onChange={(event) => resizeSelectedDraftImage(Number(event.target.value))}
                      className="min-w-[140px] accent-sky-600"
                    />
                    <Input
                      type="number"
                      min={MIN_DRAFT_IMAGE_WIDTH}
                      max={MAX_DRAFT_IMAGE_WIDTH}
                      value={selectedDraftImageWidth}
                      onChange={(event) => resizeSelectedDraftImage(Number(event.target.value))}
                      className="max-w-[100px] text-xs"
                    />
                    <span className="shrink-0">px</span>
                  </div>
                ) : null}
                <div className="mt-1 text-xs text-slate-500">
                  支持直接复制/拖入截图或图片；点击正文里的图片后可调整大小。
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 mt-4">
                {isModified && !readOnly ? (
                  <Button className="h-10 px-4" leftIcon={<X className="h-4 w-4" />} onClick={handleCancel}>
                    Cancel
                  </Button>
                ) : null}
                <Button
                  variant={sendDisabled ? "ghost" : "primary"}
                  className={[
                    "h-10 px-4",
                    sendDisabled ? "border-slate-200 bg-slate-200 text-slate-500 hover:bg-slate-200" : "",
                  ].join(" ")}
                  leftIcon={<Send className="h-4 w-4" />}
                  onClick={handleSend}
                  disabled={sendDisabled}
                >
                  {sending
                    ? "Sending..."
	                    : draftSendBlocked
	                      ? "External Send Detected"
	                    : draftSendLocked
	                      ? `PO Request Locked${sendLockHint ? ` (${sendLockHint})` : ""}`
	                      : sendDisabled
                        ? "PO Request Sent"
                        : "Send PO Request"}
                </Button>
              </div>
            </div>
          ) : null}

          {activeTab === "thread" ? (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className="inline-flex items-center gap-1 text-slate-500">
                    <Clock3 className="h-4 w-4" />
                    最近: {lastThreadTimestamp}
                  </div>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
                    {supplierReplyCount} 条回复
                  </span>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {threadEvents.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500">
                    暂无真实来往邮件记录
                  </div>
                ) : (
                  threadEvents.map((event) => (
                    <div key={event.id} className="rounded-2xl border border-slate-300 bg-white px-5 py-4">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-4 text-left"
                        onClick={() => setExpandedEventId((prev) => (prev === event.id ? null : event.id))}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                                event.type === "reply"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : event.type === "reminder"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              {event.type === "reply" ? (
                                <MailCheck className="h-3.5 w-3.5" />
                              ) : event.type === "reminder" ? (
                                <Clock3 className="h-3.5 w-3.5" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                              <span>{event.type === "reply" ? "回复" : event.type === "reminder" ? "催发" : "发出"}</span>
                            </span>
                            <span className="truncate text-xl font-semibold text-slate-800">
                              {event.type === "reply" ? event.from || selectedMerchantEmail : event.to || selectedMerchantEmail}
                            </span>
                            {(event.attachments?.length || 0) > 0 ? (
                              <span className="inline-flex items-center gap-1 text-sm text-slate-500">
                                <Paperclip className="h-4 w-4" />
                                {event.attachments?.length}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className=" text-sm text-slate-500">{event.timestamp}</div>
                          <ChevronDown
                            className={`ml-auto mt-1 h-4 w-4 text-slate-400 transition-transform ${
                              expandedEventId === event.id ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                      </button>
                      {expandedEventId === event.id ? (
                        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                          <div className="mb-4 text-slate-500 font-medium space-y-1">
                            {event.from && <div>发件人: {event.from}</div>}
                            {event.to && <div>收件人: {event.to}</div>}
                            {event.subject && <div>主题: {event.subject}</div>}
                          </div>
                          
                          {event.type === "reminder" && !event.body ? (
                            <div className="whitespace-pre-wrap">
                              提醒邮件已发给 {selectedMerchantEmail}。\n\n请尽快回复当前 PO 请求（{correlationId}）。
                            </div>
                          ) : (
                            <div
                              className="email-content-preview max-w-full overflow-auto break-words [&_img]:h-auto [&_img]:max-w-full [&_table]:max-w-full"
                              dangerouslySetInnerHTML={{ __html: event.body || event.description || "" }}
                            />
                          )}
                          
                          {event.attachments?.length ? (
                            <div className="mt-4 space-y-2 border-t border-slate-200 pt-3">
                              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Attachments</div>
                              <div className="space-y-2">
                                {event.attachments.map((attachment) => (
                                  <div
                                    key={`${event.id}-${attachment.fileName}-${attachment.attachmentId || attachment.mimeType}`}
                                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                                  >
                                    <div className="min-w-0">
                                      <div className="truncate font-medium text-slate-800">{attachment.fileName}</div>
                                      <div className="text-xs text-slate-500">{attachment.mimeType}</div>
                                    </div>
                                    <div className="shrink-0 text-right text-xs text-slate-500">
                                      <div>{attachment.size ? `${Math.max(1, Math.round(attachment.size / 1024))} KB` : "-"}</div>
                                      {attachment.attachmentId ? (
                                        <div className="mt-1 flex items-center justify-end gap-2">
                                          <a
                                            href="#"
                                            onClick={(evt) => {
                                              evt.preventDefault();
                                              if (!canInlinePreview(attachment.mimeType)) return;
                                              setPreviewAttachment({
                                                fileName: attachment.fileName,
                                                mimeType: attachment.mimeType,
                                                url: buildAttachmentHref(event, attachment, true),
                                              });
                                            }}
                                            className="font-medium text-sky-700 hover:text-sky-900"
                                          >
                                            Preview
                                          </a>
                                          <a
                                            href={buildAttachmentHref(event, attachment, false)}
                                            className="font-medium text-sky-700 hover:text-sky-900"
                                          >
                                            Download
                                          </a>
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>

              <Button
                className="mt-5 h-11 px-5"
                leftIcon={<MessageSquareText className="h-4 w-4" />}
                onClick={handleReplyInThread}
                disabled={readOnly || !latestThreadEvent}
              >
                在线程中回复
              </Button>
            </div>
          ) : null}

          {activeTab === "detection" ? (
            <PoDetectionPanel
              embedded
              detections={detections}
              selectedDetectionId={selectedDetectionId}
              onSelect={onSelectDetection}
              onConfirm={onConfirmDetection}
              manualPoNumber={manualPoNumber}
              currentInvoiceReference={currentInvoiceReference}
              onManualPoNumberChange={onManualPoNumberChange}
              onSyncManualPoToReference={onSyncManualPoToReference}
              readOnly={readOnly}
              readOnlyReason={readOnlyReason}
            />
          ) : null}
        </div>
      </div>
      </Card>
      {previewAttachment ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-slate-900">{previewAttachment.fileName}</div>
                <div className="text-xs text-slate-500">{previewAttachment.mimeType}</div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-[70vh] flex-1 bg-slate-100">
              {previewAttachment.mimeType.startsWith("image/") ? (
                <div className="flex h-full items-center justify-center p-4">
                  <img src={previewAttachment.url} alt={previewAttachment.fileName} className="max-h-full max-w-full object-contain" />
                </div>
              ) : (
                <iframe title={previewAttachment.fileName} src={previewAttachment.url} className="h-[70vh] w-full border-0" />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
