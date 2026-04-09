import { useEffect, useMemo, useState } from "react";
import { Button, Input, Textarea, useToast } from "@/components/ui";
import type { ArrivalNotice, WorkCard } from "@/types";
import { sendArrivalNotice } from "@/features/parts/api/partsApi";
import { buildHtmlEmailWithSharedSignature } from "@/features/email/emailSignature";
import { Send, X } from "lucide-react";

type ArrivalEmailDraftModalProps = {
  card: WorkCard;
  onClose: () => void;
  onSent: (arrivalNotice: ArrivalNotice) => void | Promise<void>;
};

function buildVehicleLabel(card: WorkCard) {
  const plate = card.details.plate.trim();
  const year = card.details.year.trim();
  const make = card.details.make.trim();
  return [plate, year, make].filter(Boolean).join(" ");
}

function buildVehicleDescription(card: WorkCard) {
  const plate = card.details.plate.trim();
  const year = card.details.year.trim();
  const make = card.details.make.trim();
  const model = card.details.model.trim();
  return [plate, year, make, model].filter(Boolean).join(" ");
}

function buildDefaultSubject(card: WorkCard) {
  const vehicleLabel = buildVehicleLabel(card);
  if (vehicleLabel) {
    return `${vehicleLabel} repair parts have arrived. Please bring your vehicle in for repair.`;
  }
  return "Your repair parts have arrived. Please bring your vehicle in for repair.";
}

function buildDefaultBody(card: WorkCard) {
  const owner = card.details.owner.trim();
  const vehicleDescription = buildVehicleDescription(card) || "your vehicle";
  const greeting = owner ? `Dear ${owner},` : "Dear Customer,";

  return [
    greeting,
    "",
    `The parts required for repairing ${vehicleDescription} have arrived at our workshop.`,
    "Please arrange to bring your vehicle in so we can complete the repair.",
    "",
    "If you have already booked in, please ignore this message.",
  ].join("\n");
}

function formatSentTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function ArrivalEmailDraftModal({ card, onClose, onSent }: ArrivalEmailDraftModalProps) {
  const toast = useToast();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const defaultDraft = useMemo(
    () => ({
      to: card.arrivalNotice.recipientEmail.trim() || card.details.email.trim(),
      subject: card.arrivalNotice.lastSubject.trim() || buildDefaultSubject(card),
      body: card.arrivalNotice.lastBody || buildDefaultBody(card),
    }),
    [card]
  );

  useEffect(() => {
    setTo(defaultDraft.to);
    setSubject(defaultDraft.subject);
    setBody(defaultDraft.body);
  }, [defaultDraft]);

  const handleSend = async () => {
    if (!to.trim() || !subject.trim() || sending) return;

    setSending(true);
    const res = await sendArrivalNotice(card.jobId, card.id, {
      to: to.trim(),
      subject: subject.trim(),
      body,
      htmlBody: buildHtmlEmailWithSharedSignature(body),
    });

    if (!res.ok || !res.data?.arrivalNotice) {
      toast.error(res.error || "邮件发送失败");
      setSending(false);
      return;
    }

    toast.success("客户提醒邮件已发送");
    await onSent(res.data.arrivalNotice);
    setSending(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className="flex w-full max-w-3xl max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[rgba(0,0,0,0.08)] px-6 py-5">
          <div>
            <div className="text-lg font-semibold text-[var(--ds-text)]">客户到货提醒邮件</div>
            <div className="mt-1 text-sm text-[var(--ds-muted)]">
              主题和正文已经先帮您生成，发送前都可以修改。
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[var(--ds-muted)] transition hover:bg-[rgba(0,0,0,0.05)] hover:text-[var(--ds-text)]"
            title="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <div className="font-medium">{buildVehicleDescription(card) || card.carInfo}</div>
            <div className="mt-1 text-sky-800">The required repair parts for this vehicle have arrived.</div>
            {card.arrivalNotice.sentAt ? (
              <div className="mt-2 text-xs text-emerald-700">Last sent: {formatSentTime(card.arrivalNotice.sentAt)}</div>
            ) : null}
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--ds-text)]">收件人</span>
            <Input
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="customer@example.com"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--ds-text)]">邮件主题</span>
            <Input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="请输入邮件主题"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--ds-text)]">邮件正文</span>
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={12}
              placeholder="请输入邮件正文"
            />
            <div className="text-xs text-[var(--ds-muted)]">The shared company HTML signature will be appended automatically when sending.</div>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[rgba(0,0,0,0.08)] bg-[rgba(248,250,252,0.9)] px-6 py-4">
          <Button onClick={onClose} disabled={sending}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={handleSend}
            disabled={!to.trim() || !subject.trim() || sending}
            leftIcon={<Send className="h-4 w-4" />}
          >
            {sending ? "发送中..." : card.arrivalNotice.sentAt ? "再次发送" : "确认发送"}
          </Button>
        </div>
      </div>
    </div>
  );
}
