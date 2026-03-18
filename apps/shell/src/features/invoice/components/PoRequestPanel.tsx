import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Clock3, FileSearch, MailCheck, MessageSquareText, Paperclip, Send, Settings2, X } from "lucide-react";
import { Button, Card, Input, Select, Textarea } from "@/components/ui";
import { withApiBase } from "@/utils/api";
import { PoDetectionPanel } from "./PoDetectionPanel";
import { StatusBadge } from "./StatusBadge";
import type { EmailState, EmailTimelineEvent, InvoiceItem, MerchantEmailRecipient, PoDetection } from "../types";

type Props = {
  merchantEmailRecipients: MerchantEmailRecipient[];
  selectedMerchantEmail: string;
  correlationId: string;
  vehicleRego: string;
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

    // Fallback for old data shape.
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

  const vehicleLabel = useMemo(
    () => `${[vehicleRego, vehicleModel, vehicleMake].filter(Boolean).join(" ")} from NZAT`,
    [vehicleMake, vehicleModel, vehicleRego]
  );

  const defaultSubject = useMemo(
    () => `PO Request for ${vehicleLabel} [${correlationId}]`,
    [correlationId, vehicleLabel]
  );

  const invoiceItemsText = useMemo(
    () =>
      items
        .map(
          (item, index) =>
            `${index + 1}. ${item.itemCode || "-"} | ${item.description} | Qty: ${item.quantity} | $${item.unitPrice.toFixed(2)} `
        )
        .join("\n"),
    [items]
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
      : "team";
  const defaultBody = useMemo(
    () =>
      `Hi ${greetingName},\n\nPlease find the server items below:\n${invoiceItemsText}\n\nTotal: $${snapshotTotal.toFixed(2)}.\n\nKind regards,\n\nEric Zhao\nAUTO TECH REPAIR & SERVICES\n\n486 Ellerslie Panmure Highway\nMount Wellington, Auckland 1060\n\nM: 021 029 88666\nT: 09 213 1988`,
    [greetingName, invoiceItemsText, snapshotTotal]
  );

  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [quickAddRecipient, setQuickAddRecipient] = useState("");
  const [lastSentPayload, setLastSentPayload] = useState<{ to: string; subject: string; body: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"compose" | "thread" | "detection">("compose");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<{ fileName: string; mimeType: string; url: string } | null>(null);

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

    setSubject(ensureReplySubject(latestThreadEvent?.subject));
  }, [defaultSubject, isDraftRound, latestThreadEvent?.subject]);

  useEffect(() => {
    setBody(defaultBody);
  }, [defaultBody]);

  const isModified = to !== selectedMerchantEmail || subject !== defaultSubject || body !== defaultBody;
  const isCurrentPayloadSent =
    lastSentPayload?.to === to && lastSentPayload?.subject === subject && lastSentPayload?.body === body;

  const sendDisabled = readOnly || sending || Boolean(isCurrentPayloadSent && !isModified);

  const handleSend = async () => {
    const payload = { to: normalizedToValue, subject, body };
    setSending(true);
    try {
      await onSendRequest(payload);
      setLastSentPayload(payload);
      setTo(normalizedToValue);
      setBody("");
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

  const ensureReplySubject = (value: string | undefined) => {
    const trimmed = value?.trim() || defaultSubject;
    return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
  };

  const handleReplyInThread = () => {
    const replyTarget =
      latestThreadEvent?.type === "reply"
        ? extractEmailAddress(latestThreadEvent.from) || selectedMerchantEmail
        : extractEmailAddress(latestThreadEvent?.to) || selectedMerchantEmail;
    const replySubject = ensureReplySubject(latestThreadEvent?.subject);

    setTo(replyTarget);
    setSubject(replySubject);
    setBody("");
    setQuickAddRecipient("");
    setActiveTab("compose");
  };

  const getThreadEventContent = (event: EmailTimelineEvent) => {
    const lines = [
      event.from ? `发件人: ${event.from}` : "",
      event.to ? `收件人: ${event.to}` : "",
      event.subject ? `主题: ${event.subject}` : "",
      "",
      event.body || event.description,
    ].filter(Boolean);

    if (event.type === "reminder" && !event.body) {
      return `提醒邮件已发给 ${selectedMerchantEmail}。\n\n请尽快回复当前 PO 请求（${correlationId}）。`;
    }

    return lines.join("\n");
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

      {/* <div className="text-[28px] font-semibold tracking-[-0.03em] text-slate-900">Request Purchase Order</div> */}

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
      {/* <div className="mt-2 text-xs text-slate-500">每次新的 Sent 会开启新一轮催发流程，直到 Get Reply 或 Escalation Required。</div> */}

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
                <div className="mt-1 text-xs text-slate-500">支持多个收件人，使用逗号、分号或换行分隔。</div>
              </div>
              <div>
                <div className="mb-1 font-semibold text-slate-900">Subject</div>
                <Input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  disabled={readOnly || !isDraftRound}
                />
                {!isDraftRound ? (
                  <div className="mt-1 text-xs text-slate-500">
                    只有首次 Draft 邮件可以修改主题；后续 round 只能在线程中回复，主题保持当前邮件线程。
                  </div>
                ) : null}
              </div>
              <div>
                <div className="mb-1 font-semibold text-slate-900">Body</div>
                <Textarea rows={12} value={body} onChange={(event) => setBody(event.target.value)} disabled={readOnly} />
              </div>
              <div className="flex items-center justify-end gap-2">
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
                  {sending ? "Sending..." : sendDisabled ? "PO Request Sent" : "Send PO Request"}
                </Button>
              </div>
            </div>
          ) : null}

          {activeTab === "thread" ? (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  
                  {/* <div className="mt-2 flex items-center gap-2 text-sm font-mono text-slate-500">
                    <span>{syntheticThreadId}</span>
                    <Copy className="h-4 w-4" />
                  </div> */}
                </div>
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
                              title={event.type === "reply" ? "商户回复" : event.type === "reminder" ? "催发邮件" : "系统发出"}
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
                        <div className="mt-4 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                          {getThreadEventContent(event)}
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
