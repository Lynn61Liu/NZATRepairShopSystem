import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Clock3, MailCheck, MessageSquareText, Paperclip, Send, Settings2, X } from "lucide-react";
import { Button, Card, Input, Select, Textarea } from "@/components/ui";
import { PoDetectionPanel } from "./PoDetectionPanel";
import { StatusBadge } from "./StatusBadge";
import type { EmailState, EmailTimelineEvent, InvoiceItem, PoDetection } from "../types";

type Props = {
  merchantUserName: string;
  merchantEmails: string[];
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
  onSendRequest: (payload: { to: string; subject: string; body: string }) => void;
  onSelectDetection: (id: string) => void;
  onConfirmDetection: (id: string) => void;
  onRejectDetection: (id: string) => void;
  onManualPoNumberChange: (value: string) => void;
  onSyncManualPoToReference: () => void;
};

export function PoRequestPanel({
  merchantUserName,
  merchantEmails,
  selectedMerchantEmail,
  correlationId,
  vehicleRego,
  vehicleModel,
  vehicleMake,
  snapshotTotal,
  items,
  emailStates,
  timelineEvents,
  detections,
  selectedDetectionId,
  manualPoNumber,
  currentInvoiceReference,
  onSendRequest,
  onSelectDetection,
  onConfirmDetection,
  onRejectDetection,
  onManualPoNumberChange,
  onSyncManualPoToReference,
}: Props) {
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

  const defaultBody = useMemo(
    () =>
      `Hi ${merchantUserName},\n\nPlease find the server items below:\n${invoiceItemsText}\n\n Total: $${snapshotTotal.toFixed(2)}.`,
    [invoiceItemsText, merchantUserName, snapshotTotal]
  );

  const [to, setTo] = useState(selectedMerchantEmail);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [lastSentPayload, setLastSentPayload] = useState<{ to: string; subject: string; body: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"compose" | "thread" | "detection">("compose");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const threadEvents = useMemo(
    () => timelineEvents.filter((event) => ["sent", "reminder", "reply"].includes(event.type)),
    [timelineEvents]
  );
  const supplierReplyCount = threadEvents.filter((event) => event.type === "reply").length;
  const lastThreadTimestamp = threadEvents[0]?.timestamp ?? "暂无记录";

  useEffect(() => {
    setTo(selectedMerchantEmail);
  }, [selectedMerchantEmail]);

  useEffect(() => {
    setSubject(defaultSubject);
  }, [defaultSubject]);

  useEffect(() => {
    setBody(defaultBody);
  }, [defaultBody]);

  const isModified = to !== selectedMerchantEmail || subject !== defaultSubject || body !== defaultBody;
  const isCurrentPayloadSent =
    lastSentPayload?.to === to && lastSentPayload?.subject === subject && lastSentPayload?.body === body;

  const sendDisabled = Boolean(isCurrentPayloadSent && !isModified);

  const handleSend = () => {
    const payload = { to, subject, body };
    onSendRequest(payload);
    setLastSentPayload(payload);
  };

  const handleCancel = () => {
    setTo(selectedMerchantEmail);
    setSubject(defaultSubject);
    setBody(defaultBody);
  };

  const getThreadEventContent = (event: EmailTimelineEvent) => {
    if (event.type === "sent") {
      return `收件人: ${to}\n主题: ${subject}\n\n${body}`;
    }
    if (event.type === "reminder") {
      return `提醒邮件已发给 ${selectedMerchantEmail}。\n\n请尽快回复当前 PO 请求（${correlationId}）。`;
    }
    return `商户回复邮件\n\n${event.description}`;
  };

  return (
    <Card className="rounded-[18px] p-6">
      {/* <div className="text-[28px] font-semibold tracking-[-0.03em] text-slate-900">Request Purchase Order</div> */}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {emailStates.map((state) => (
          <div key={state} className="flex items-center gap-2">
            <MailCheck className="h-4 w-4 text-slate-500" />
            <StatusBadge kind="state" value={state} />
          </div>
        ))}
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
                <Select value={to} onChange={(event) => setTo(event.target.value)}>
                  {merchantEmails.map((email) => (
                    <option key={email} value={email}>
                      {email}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <div className="mb-1 font-semibold text-slate-900">Subject</div>
                <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
              </div>
              <div>
                <div className="mb-1 font-semibold text-slate-900">Body</div>
                <Textarea rows={12} value={body} onChange={(event) => setBody(event.target.value)} />
              </div>
              <div className="flex items-center justify-end gap-2">
                {isModified ? (
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
                  {sendDisabled ? "PO Request Sent" : "Send PO Request"}
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
                {threadEvents.map((event) => (
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
                            title={event.type === "reply" ? "商户回复" : event.type === "reminder" ? "自动提醒" : "系统发出"}
                          >
                            {event.type === "reply" ? (
                              <MailCheck className="h-3.5 w-3.5" />
                            ) : event.type === "reminder" ? (
                              <Clock3 className="h-3.5 w-3.5" />
                            ) : (
                              <Send className="h-3.5 w-3.5" />
                            )}
                            <span>{event.type === "reply" ? "回复" : event.type === "reminder" ? "提醒" : "发出"}</span>
                          </span>
                          <span className="truncate text-xl font-semibold text-slate-800">{selectedMerchantEmail}</span>
                          {event.type === "reply" ? (
                            <span className="inline-flex items-center gap-1 text-sm text-slate-500">
                              <Paperclip className="h-4 w-4" />
                              1
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 flex items-center gap-2 font-mono text-sm text-slate-500">
                          {/* <span>{event.id}</span> */}
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
                      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-wrap">
                        {getThreadEventContent(event)}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <Button className="mt-5 h-11 px-5" leftIcon={<MessageSquareText className="h-4 w-4" />}>在线程中回复</Button>
            </div>
          ) : null}

          {activeTab === "detection" ? (
            <PoDetectionPanel
              embedded
              detections={detections}
              selectedDetectionId={selectedDetectionId}
              onSelect={onSelectDetection}
              onConfirm={onConfirmDetection}
              onReject={onRejectDetection}
              manualPoNumber={manualPoNumber}
              currentInvoiceReference={currentInvoiceReference}
              onManualPoNumberChange={onManualPoNumberChange}
              onSyncManualPoToReference={onSyncManualPoToReference}
            />
          ) : null}
        </div>
      </div>
    </Card>
  );
}
