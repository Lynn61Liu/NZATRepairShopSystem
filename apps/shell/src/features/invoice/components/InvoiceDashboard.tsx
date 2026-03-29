import { useInvoiceDashboardState, type InvoiceDashboardModel } from "../hooks/useInvoiceDashboardState";
import { XeroReadOnlyInvoiceView } from "./XeroReadOnlyInvoiceView";

type InvoiceDashboardProps = {
  model?: InvoiceDashboardModel;
  hasInvoice?: boolean;
  onCreateInvoice?: () => Promise<{ success: boolean; message?: string }>;
  isCreatingInvoice?: boolean;
  needsPo?: boolean;
};

export function InvoiceDashboard({ model, hasInvoice, onCreateInvoice, isCreatingInvoice }: InvoiceDashboardProps) {
  const dashboard = model ?? useInvoiceDashboardState();
  return (
    <InvoiceDashboardContent
      model={dashboard}
      hasInvoice={hasInvoice}
      onCreateInvoice={onCreateInvoice}
      isCreatingInvoice={isCreatingInvoice}
    />
  );
}

export function InvoiceDashboardContent({
  model,
  hasInvoice,
}: {
  model: InvoiceDashboardModel;
  hasInvoice?: boolean;
  onCreateInvoice?: () => Promise<{ success: boolean; message?: string }>;
  isCreatingInvoice?: boolean;
}) {
  return (
    <div className="space-y-6">
      <XeroReadOnlyInvoiceView model={model} hasInvoice={hasInvoice} />
    </div>
  );
}
