import { useMemo, useState } from "react";
import { useToast } from "@/components/ui";
import { EmailTimeline } from "./EmailTimeline";
import { InvoiceItemsTable } from "./InvoiceItemsTable";
import { InvoiceSummaryCard } from "./InvoiceSummaryCard";
import { PoDetectionPanel } from "./PoDetectionPanel";
import { PoRequestPanel } from "./PoRequestPanel";
import { ReminderPanel } from "./ReminderPanel";
import { WorkflowSidebar } from "./WorkflowSidebar";
import {
  initialEmailTimeline,
  initialInvoiceItems,
  initialInvoiceState,
  initialItemCatalog,
  initialPoDetections,
  invoiceWorkflowSteps,
} from "../mockData";
import type { InvoiceItem, TaxRateOption } from "../types";

const TAX_RATE_PERCENTAGE: Record<TaxRateOption, number> = {
  "15% GST on Expenses": 15,
  "15% GST on Income": 15,
  "GST on Imports": 15,
  "No GST": 0,
  "Zero Rated": 0,
  "Zero Rated - Exp": 0,
};

function createNewItem(nextId: number): InvoiceItem {
  return {
    id: `line-${nextId}`,
    itemCode: "",
    description: "New invoice line item",
    quantity: 1,
    unitPrice: 0,
    discount: 0,
    account: "",
    taxRate: "15% GST on Income",
  };
}

function getBaseAmount(item: InvoiceItem) {
  return item.quantity * item.unitPrice * (1 - item.discount / 100);
}

function getTaxAmount(item: InvoiceItem) {
  return getBaseAmount(item) * (TAX_RATE_PERCENTAGE[item.taxRate] / 100);
}

export function InvoiceDashboard() {
  const toast = useToast();
  const [invoice, setInvoice] = useState(initialInvoiceState);
  const [items, setItems] = useState(initialInvoiceItems);
  const [itemCatalog, setItemCatalog] = useState(initialItemCatalog);
  const [timeline, setTimeline] = useState(initialEmailTimeline);
  const [detections, setDetections] = useState(initialPoDetections);
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [nextItemId, setNextItemId] = useState(initialInvoiceItems.length + 1);
  const [itemCatalogSyncState, setItemCatalogSyncState] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [itemCatalogFeedback, setItemCatalogFeedback] = useState<string | null>(null);
  const [itemCatalogLastUpdated, setItemCatalogLastUpdated] = useState<string | null>(null);
  const [itemsDirty, setItemsDirty] = useState(!initialInvoiceState.synced);
  const [pendingFocusRowId, setPendingFocusRowId] = useState<string | null>(null);

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + getBaseAmount(item), 0), [items]);
  const taxTotal = useMemo(() => items.reduce((sum, item) => sum + getTaxAmount(item), 0), [items]);
  const totalAmount = useMemo(() => subtotal + taxTotal, [subtotal, taxTotal]);

  const updateItem = (id: string, field: keyof InvoiceItem, value: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (field === "itemCode") {
          const code = value.split(" - ")[0].trim();
          const matched = itemCatalog.find((entry) => entry.code === code);
          if (matched) {
            return {
              ...item,
              itemCode: matched.code,
              description: matched.name,
              unitPrice: matched.unitPrice,
              account: matched.account,
              taxRate: matched.taxRate,
            };
          }
          return { ...item, itemCode: value };
        }
        if (field === "description" || field === "account") {
          return { ...item, [field]: value };
        }
        const parsed = Number(value || 0);
        return { ...item, [field]: Number.isFinite(parsed) ? parsed : 0 };
      })
    );
    setInvoice((prev) => ({ ...prev, synced: false }));
    setItemsDirty(true);
  };

  const addItem = () => {
    const newId = `line-${nextItemId}`;
    setItems((prev) => [...prev, createNewItem(nextItemId)]);
    setNextItemId((prev) => prev + 1);
    setPendingFocusRowId(newId);
    setInvoice((prev) => ({ ...prev, synced: false }));
    setItemsDirty(true);
    toast.info("Added a new invoice item row");
  };

  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setInvoice((prev) => ({ ...prev, synced: false }));
    setItemsDirty(true);
    toast.info("Invoice item removed");
  };

  const syncInvoice = () => {
    if (!itemsDirty) return;
    const now = new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");
    setInvoice((prev) => ({
      ...prev,
      synced: true,
      status: prev.status === "Draft" ? "Awaiting PO" : prev.status,
      lastSyncTime: now,
      lastSyncDirection: "System -> Xero",
      currentWorkflowStep: Math.max(prev.currentWorkflowStep, 2),
    }));
    setItemsDirty(false);
    setTimeline((prev) => [
      {
        id: `evt-sync-${Date.now()}`,
        type: "updated",
        timestamp: now,
        description: "Invoice synced to Xero successfully",
      },
      ...prev,
    ]);
    toast.success("Invoice synced with Xero");
  };

  const openInXero = () => {
    window.open("https://go.xero.com", "_blank", "noopener,noreferrer");
  };

  const refreshItemCatalog = () => {
    if (itemCatalogSyncState === "syncing") return;
    const startedAt = new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");
    setItemCatalogSyncState("syncing");
    setItemCatalogFeedback("Syncing item list from Xero. Existing invoice rows stay untouched until you choose an item.");
    toast.info("Refreshing Xero item list...");

    window.setTimeout(() => {
      setItemCatalog((prev) => {
        const existing = new Set(prev.map((item) => item.code));
        return existing.has("LAB-320")
          ? prev
          : [
              ...prev,
              {
                code: "LAB-320",
                name: "Battery Health Check",
                unitPrice: 72,
                account: "200 - Sales",
                taxRate: "15% GST on Income",
              },
            ];
      });
      setItemCatalogSyncState("success");
      setItemCatalogLastUpdated(startedAt);
      setItemCatalogFeedback("Xero item list updated. New item definitions are ready for manual selection in the Item column.");
      toast.success("Xero item list updated");
    }, 900);
  };

  const sendPoRequest = () => {
    const now = new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");
    setInvoice((prev) => ({
      ...prev,
      emailStates: ["Email Sent", "Waiting for Reply", "Reminder Scheduled"],
      currentWorkflowStep: Math.max(prev.currentWorkflowStep, 3),
      lastEmailSent: now,
      nextReminderIn: "23h 59m",
    }));
    setTimeline((prev) => [
      {
        id: `evt-send-${Date.now()}`,
        type: "sent",
        timestamp: now,
        description: `PO request email sent to ${invoice.merchantEmail}`,
      },
      ...prev,
    ]);
    toast.success("PO request email sent");
  };

  const sendReminderNow = () => {
    const now = new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");
    setInvoice((prev) => ({
      ...prev,
      remindersSent: Math.min(prev.reminderLimit, prev.remindersSent + 1),
      nextReminderIn: "47h 59m",
      lastEmailSent: now,
    }));
    setTimeline((prev) => [
      {
        id: `evt-reminder-${Date.now()}`,
        type: "reminder",
        timestamp: now,
        description: "Manual reminder email sent to supplier",
      },
      ...prev,
    ]);
    toast.success("Reminder sent");
  };

  const confirmPo = (id: string) => {
    const po = detections.find((item) => item.id === id);
    if (!po) return;
    setDetections((prev) => prev.map((item) => (item.id === id ? { ...item, status: "confirmed" } : item)));
    setInvoice((prev) => ({
      ...prev,
      status: "PO Received",
      reference: po.poNumber,
      currentWorkflowStep: Math.max(prev.currentWorkflowStep, 6),
    }));
    setTimeline((prev) => [
      {
        id: `evt-confirm-${Date.now()}`,
        type: "confirmed",
        timestamp: new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-"),
        description: `${po.poNumber} confirmed and invoice reference ready for Xero`,
      },
      ...prev,
    ]);
    toast.success(`${po.poNumber} confirmed`);
  };

  const rejectPo = (id: string) => {
    const po = detections.find((item) => item.id === id);
    if (!po) return;
    setDetections((prev) => prev.map((item) => (item.id === id ? { ...item, status: "rejected" } : item)));
    if (selectedDetectionId === id) {
      setSelectedDetectionId(null);
    }
    toast.info(`${po.poNumber} rejected`);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-3">
        <WorkflowSidebar steps={invoiceWorkflowSteps} currentStep={invoice.currentWorkflowStep} />
      </div>

      <div className="space-y-6 lg:col-span-9">
        <InvoiceSummaryCard
          invoice={invoice}
          subtotal={subtotal}
          taxTotal={taxTotal}
          totalAmount={totalAmount}
          canSync={itemsDirty}
          onSync={syncInvoice}
          onOpenXero={openInXero}
        >
          <InvoiceItemsTable
            items={items}
            synced={invoice.synced}
            subtotal={subtotal}
            taxTotal={taxTotal}
            totalAmount={totalAmount}
            itemCatalog={itemCatalog}
            itemCatalogSyncState={itemCatalogSyncState}
            itemCatalogFeedback={itemCatalogFeedback}
            itemCatalogLastUpdated={itemCatalogLastUpdated}
            pendingFocusRowId={pendingFocusRowId}
            onAddItem={addItem}
            onChangeItem={updateItem}
            onDeleteItem={deleteItem}
            onRefreshItemCatalog={refreshItemCatalog}
            onPendingFocusHandled={() => setPendingFocusRowId(null)}
          />
        </InvoiceSummaryCard>
        <PoRequestPanel
          merchantEmail={invoice.merchantEmail}
          correlationId={invoice.correlationId}
          snapshotTotal={invoice.snapshotTotal}
          emailStates={invoice.emailStates}
          previewOpen={previewOpen}
          onTogglePreview={() => setPreviewOpen((prev) => !prev)}
          onSendRequest={sendPoRequest}
        />
        <ReminderPanel
          lastEmailSent={invoice.lastEmailSent}
          lastReplyReceived={invoice.lastReplyReceived}
          remindersSent={invoice.remindersSent}
          reminderLimit={invoice.reminderLimit}
          nextReminderIn={invoice.nextReminderIn}
          onConfigure={() => toast.info("Reminder settings coming next")}
          onSendNow={sendReminderNow}
        />
        <EmailTimeline events={timeline} />
        <PoDetectionPanel
          detections={detections}
          selectedDetectionId={selectedDetectionId}
          onSelect={setSelectedDetectionId}
          onConfirm={confirmPo}
          onReject={rejectPo}
        />
      </div>
    </div>
  );
}
