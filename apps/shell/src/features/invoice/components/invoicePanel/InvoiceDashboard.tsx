import { useInvoiceDashboardState, type InvoicePanelModel } from "../../hooks/useInvoiceDashboardState";
import { XeroReadOnlyInvoiceView } from "./XeroReadOnlyInvoiceView";

type InvoiceDashboardProps = {
  model?: InvoicePanelModel;
  hasInvoice?: boolean;
  onCreateInvoice?: () => Promise<{ success: boolean; message?: string }>;
  isCreatingInvoice?: boolean;
  needsPo?: boolean;
};

export function InvoiceDashboard({ model, hasInvoice, onCreateInvoice, isCreatingInvoice }: InvoiceDashboardProps) {
  const fallbackDashboard = useInvoiceDashboardState().invoicePanel;
  const dashboard = model ?? fallbackDashboard;
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
  model: InvoicePanelModel;
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
