import { useInvoiceDashboardState, type InvoiceDashboardModel } from "../hooks/useInvoiceDashboardState";
import { InvoiceItemsTable } from "./InvoiceItemsTable";
import { InvoiceSummaryCard } from "./InvoiceSummaryCard";
import { WorkflowSidebar } from "./WorkflowSidebar";
import type { WorkflowStep } from "../types";

const invoiceWorkflowSteps: WorkflowStep[] = [
  { id: 1, title: "Draft Created", description: "Invoice draft initialized" },
  { id: 2, title: "Synced", description: "Synced with Xero" },
  { id: 3, title: "PO Requested", description: "Email sent to supplier" },
  { id: 4, title: "Waiting Reply", description: "Awaiting supplier response" },
  { id: 5, title: "PO Extracted", description: "PO number detected" },
  { id: 6, title: "PO Confirmed", description: "PO verified and approved" },
  { id: 7, title: "Reference Updated", description: "Updated in Xero" },
  { id: 8, title: "Awaiting Payment", description: "Invoice approved and waiting for payment" },
  { id: 9, title: "Paid", description: "Payment received" },
];

function getVisibleWorkflowSteps(needsPo?: boolean) {
  return needsPo ? invoiceWorkflowSteps : invoiceWorkflowSteps.filter((step) => step.id < 3 || step.id > 7);
}

type InvoiceDashboardProps = {
  model?: InvoiceDashboardModel;
  hasInvoice?: boolean;
  onCreateInvoice?: () => Promise<{ success: boolean; message?: string }>;
  isCreatingInvoice?: boolean;
  needsPo?: boolean;
};

export function InvoiceDashboard({ model, hasInvoice, onCreateInvoice, isCreatingInvoice, needsPo }: InvoiceDashboardProps) {
  const dashboard = model ?? useInvoiceDashboardState();
  return (
    <InvoiceDashboardContent
      model={dashboard}
      hasInvoice={hasInvoice}
      onCreateInvoice={onCreateInvoice}
      isCreatingInvoice={isCreatingInvoice}
      needsPo={needsPo}
    />
  );
}

export function InvoiceDashboardContent({
  model,
  hasInvoice,
  onCreateInvoice,
  isCreatingInvoice,
  needsPo,
}: {
  model: InvoiceDashboardModel;
  hasInvoice?: boolean;
  onCreateInvoice?: () => Promise<{ success: boolean; message?: string }>;
  isCreatingInvoice?: boolean;
  needsPo?: boolean;
}) {
  const visibleSteps = getVisibleWorkflowSteps(needsPo);
  const isReadOnly = model.invoice.xeroStatus === "PAID";
  const currentWorkflowStep =
    model.invoice.xeroStatus === "PAID"
      ? 9
      : model.invoice.xeroStatus === "AUTHORISED"
        ? 8
        : model.invoice.status === "PO Received"
          ? Math.max(model.invoice.currentWorkflowStep, 7)
          : model.invoice.currentWorkflowStep;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-3">
        <WorkflowSidebar steps={visibleSteps} currentStep={currentWorkflowStep} />
      </div>

      <div className="space-y-6 lg:col-span-9">
        <InvoiceSummaryCard
          invoice={model.invoice}
          subtotal={model.subtotal}
          taxTotal={model.taxTotal}
          totalAmount={model.totalAmount}
          canSync={!isReadOnly && model.itemsDirty}
          canDiscardChanges={!isReadOnly && model.itemsDirty}
          onSync={model.syncInvoice}
          onDiscardChanges={() => void model.discardChanges()}
          onRefreshFromXero={model.refreshFromXero}
          onOpenXero={model.openInXero}
          onSaveReference={model.saveReference}
          onUpdateXeroState={model.updateXeroState}
          isRefreshingFromXero={model.refreshingFromXero}
          isUpdatingXeroState={model.updatingXeroState}
          referencePreview={model.referencePreview}
          hasInvoice={hasInvoice}
          onCreateInvoice={onCreateInvoice}
          isCreatingInvoice={isCreatingInvoice}
        >
          <InvoiceItemsTable
            items={model.items}
            readOnly={isReadOnly}
            synced={model.invoice.synced}
            subtotal={model.subtotal}
            taxTotal={model.taxTotal}
            totalAmount={model.totalAmount}
            itemCatalog={model.itemCatalog}
            itemCatalogSyncState={model.itemCatalogSyncState}
            itemCatalogFeedback={model.itemCatalogFeedback}
            itemCatalogLastUpdated={model.itemCatalogLastUpdated}
            pendingFocusRowId={model.pendingFocusRowId}
            onAddItem={model.addItem}
            onChangeItem={model.updateItem}
            onDeleteItem={model.deleteItem}
            onRefreshItemCatalog={model.refreshItemCatalog}
            onPendingFocusHandled={() => model.setPendingFocusRowId(null)}
          />
        </InvoiceSummaryCard>
      </div>
    </div>
  );
}
