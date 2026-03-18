import type { InvoiceDashboardModel } from "../hooks/useInvoiceDashboardState";
import { PoRequestPanel } from "./PoRequestPanel";

type PoDashboardProps = {
  model: InvoiceDashboardModel;
};

export function PoDashboard({ model }: PoDashboardProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <PoRequestPanel
          merchantEmailRecipients={model.invoice.merchantEmailRecipients}
          selectedMerchantEmail={model.invoice.selectedMerchantEmail}
          correlationId={model.invoice.correlationId}
          vehicleRego={model.invoice.vehicleRego}
          vehicleModel={model.invoice.vehicleModel}
          vehicleMake={model.invoice.vehicleMake}
          snapshotTotal={model.totalAmount}
          items={model.items}
          emailStates={model.invoice.emailStates}
          timelineEvents={model.timeline}
          detections={model.detections}
          selectedDetectionId={model.selectedDetectionId}
          manualPoNumber={model.manualPoNumber}
          currentInvoiceReference={model.invoice.reference}
          hasConfirmedPo={model.invoice.status === "PO Received"}
          readOnly={model.poLocked}
          readOnlyReason={model.poLockReason}
          onSendRequest={model.sendPoRequest}
          onSelectDetection={model.setSelectedDetectionId}
          onConfirmDetection={model.confirmPo}
          onManualPoNumberChange={model.setManualPoNumber}
          onSyncManualPoToReference={model.syncManualPoToInvoiceReference}
        />
      </div>
    </div>
  );
}
