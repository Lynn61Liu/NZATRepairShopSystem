import { Button, SectionCard } from "@/components/ui";
import { JOB_DETAIL_TEXT } from "@/features/jobDetail/jobDetail.constants";

export function InvoicePanel() {
  return (
    <div className="py-6 space-y-3">
      <SectionCard title={JOB_DETAIL_TEXT.labels.linkToTransaction}>
        <div className="mt-2 text-xs text-[var(--ds-muted)]">{JOB_DETAIL_TEXT.labels.transactionId}</div>
        <div className="mt-2 flex items-center gap-2">
          <input
            className="h-9 flex-1 rounded-[8px] border border-[var(--ds-border)] px-3 text-sm"
            placeholder="Enter ID"
          />
          <Button>{JOB_DETAIL_TEXT.buttons.linked}</Button>
        </div>
      </SectionCard>
      <SectionCard title={JOB_DETAIL_TEXT.labels.invoiceItems}>
        <div className="mt-2 text-[var(--ds-muted)]">{JOB_DETAIL_TEXT.empty.noInvoiceItems}</div>
      </SectionCard>
    </div>
  );
}
