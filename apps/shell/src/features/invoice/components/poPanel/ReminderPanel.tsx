import { BellRing, CalendarDays, SendHorizonal, Settings2 } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { StatusBadge } from "./StatusBadge";

type Props = {
  lastEmailSent: string;
  lastReplyReceived: string;
  remindersSent: number;
  reminderLimit: number;
  nextReminderIn: string;
  onConfigure: () => void;
  onSendNow: () => void;
};

export function ReminderPanel({
  lastEmailSent,
  lastReplyReceived,
  remindersSent,
  reminderLimit,
  nextReminderIn,
  onConfigure,
  onSendNow,
}: Props) {
  return (
    <Card className="rounded-[18px] p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-[28px] font-semibold tracking-[-0.03em] text-slate-900">
          <BellRing className="h-6 w-6 text-blue-600" />
          Auto Email Reminder
        </div>
        <Button className="h-11 px-5" leftIcon={<Settings2 className="h-4 w-4" />} onClick={onConfigure}>
          Configure
        </Button>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-slate-600" />
            <StatusBadge kind="state" value="Reminder Scheduled" />
          </div>
          <Button variant="primary" className="h-11 px-5" leftIcon={<SendHorizonal className="h-4 w-4" />} onClick={onSendNow}>
            Send Now
          </Button>
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <div className="text-sm text-slate-500">Last Email Sent</div>
              <div className="text-xl font-semibold text-slate-900">{lastEmailSent}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500">Reminders Sent</div>
              <div className="text-xl font-semibold text-slate-900">{remindersSent} / {reminderLimit}</div>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-slate-500">Last Reply Received</div>
              <div className="text-xl font-semibold text-slate-900">{lastReplyReceived}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500">Next Reminder In</div>
              <div className="text-xl font-semibold text-orange-600">{nextReminderIn}</div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
