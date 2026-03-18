import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { useToast } from "@/components/ui";
import { requestJson } from "@/utils/api";
import { notifyPoDashboardRefresh } from "@/utils/refreshSignals";
import { pullJobXeroDraftInvoice, saveJobInvoiceDraft, syncJobXeroDraftInvoice, updateJobInvoiceXeroState, updateJobPoSelection } from "@/features/jobDetail/api/jobDetailApi";
import type {
  EmailState,
  EmailTimelineEvent,
  InvoiceDashboardState,
  InvoiceItem,
  MerchantEmailRecipient,
  PoDetection,
  ReferencePreviewSource,
  TaxRateOption,
  XeroItemDefinition,
  XeroStateOption,
  XeroInvoiceStatus,
} from "../types";
import type { CustomerInfo, JobInvoiceData, VehicleInfo } from "@/types";

const TAX_RATE_PERCENTAGE: Record<TaxRateOption, number> = {
  "15% GST on Expenses": 15,
  "15% GST on Income": 15,
  "GST on Imports": 15,
  "No GST": 0,
  "Zero Rated": 0,
  "Zero Rated - Exp": 0,
};

function normalizeTaxRate(value?: string | null): TaxRateOption {
  const normalized = value?.trim() as TaxRateOption | undefined;
  return normalized && normalized in TAX_RATE_PERCENTAGE ? normalized : "No GST";
}

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
  return getLineAmount(item) - getTaxAmount(item);
}

function getTaxAmount(item: InvoiceItem) {
  const rate = TAX_RATE_PERCENTAGE[item.taxRate];
  if (rate <= 0) return 0;
  return getLineAmount(item) * (rate / (100 + rate));
}

function getLineAmount(item: InvoiceItem) {
  return item.quantity * item.unitPrice * (1 - item.discount / 100);
}

function buildReference(currentReference: string, poNumber: string) {
  const trimmedPo = poNumber.trim();
  if (!trimmedPo) return currentReference;
  const slashIndex = currentReference.indexOf("/");
  if (slashIndex === -1) return trimmedPo;
  return `${trimmedPo} ${currentReference.slice(slashIndex)}`;
}

function extractPoFromReference(reference: string) {
  const trimmed = reference.trim();
  if (!trimmed) return "";
  const slashIndex = trimmed.indexOf("/");
  return (slashIndex === -1 ? trimmed : trimmed.slice(0, slashIndex)).trim();
}

function getLegacyPoFromReference(reference: string) {
  const extracted = extractPoFromReference(reference);
  if (!extracted) return "";

  // Only treat old references that explicitly look like the previous PO-prefixed format as confirmed PO data.
  return /[\\/]/.test(reference) ? extracted : "";
}

const EMAIL_STATE_ORDER: EmailState[] = ["Draft", "Email Sent", "Get Reply", "Reminder Scheduled", "Get PO"];

const initialInvoiceState: InvoiceDashboardState = {
  contact: "",
  merchantUserName: "team",
  issueDate: "",
  dueDate: "",
  invoiceNumber: "",
  reference: "",
  amountsAre: "Tax Inclusive",
  xeroInvoiceId: "",
  status: "Awaiting PO",
  xeroStatus: "UNKNOWN",
  lastSyncTime: "",
  lastSyncDirection: "Xero -> System",
  synced: false,
  merchantEmails: [],
  merchantEmailRecipients: [],
  selectedMerchantEmail: "",
  correlationId: "",
  vehicleRego: "",
  vehicleModel: "",
  vehicleMake: "",
  snapshotTotal: 0,
  emailStates: ["Draft"],
  remindersSent: 0,
  reminderLimit: 3,
  lastEmailSent: "",
  lastReplyReceived: "No reply yet",
  nextReminderIn: "NaNh NaNm",
  currentWorkflowStep: 1,
  latestPaymentMethod: "",
  latestPaymentReference: "",
};

const initialItemCatalog: XeroItemDefinition[] = [];
const EDITABLE_XERO_STATUSES: XeroInvoiceStatus[] = ["DRAFT", "AUTHORISED"];

function mergeEmailStates(current: EmailState[], add: EmailState[], remove: EmailState[] = []): EmailState[] {
  const next = new Set(current);
  remove.forEach((state) => next.delete(state));
  add.forEach((state) => next.add(state));
  return EMAIL_STATE_ORDER.filter((state) => next.has(state));
}

function applyDetectionSelection(detections: PoDetection[], selectedId: string | null) {
  return detections.map<PoDetection>((item) => ({
    ...item,
    status: (selectedId && item.id === selectedId ? "confirmed" : "pending") as PoDetection["status"],
  }));
}

type UseInvoiceDashboardStateArgs = {
  jobId?: string;
  customer?: CustomerInfo | null;
  vehicle?: VehicleInfo | null;
  persistedPoNumber?: string | null;
  persistedInvoiceReference?: string | null;
  persistedInvoice?: JobInvoiceData | null;
};

type InvoiceSnapshot = {
  invoice: InvoiceDashboardState;
  items: InvoiceItem[];
};

type LeavePromptDecision = "save" | "discard" | "stay";

function mapExternalStatus(status?: string | null): InvoiceDashboardState["status"] {
  const normalized = status?.trim().toUpperCase();
  switch (normalized) {
    case "AUTHORISED":
      return "Awaiting Payment";
    case "PAID":
      return "Paid";
    case "DRAFT":
      return "Draft";
    default:
      return "Awaiting PO";
  }
}

function mapXeroStatus(status?: string | null): XeroInvoiceStatus {
  const normalized = status?.trim().toUpperCase();
  switch (normalized) {
    case "DRAFT":
      return "DRAFT";
    case "AUTHORISED":
      return "AUTHORISED";
    case "PAID":
      return "PAID";
    default:
      return "UNKNOWN";
  }
}

function resolveInvoiceStatus(status?: string | null, poNumber?: string | null): InvoiceDashboardState["status"] {
  const mapped = mapExternalStatus(status);
  if (mapped === "Awaiting Payment") return mapped;
  if ((poNumber ?? "").trim()) return "PO Received";
  return mapped;
}

function resolveWorkflowStep(status?: string | null, poNumber?: string | null, hasInvoice?: boolean): number {
  const normalizedStatus = status?.trim().toUpperCase();
  if (normalizedStatus === "PAID") return 9;
  if (normalizedStatus === "AUTHORISED") return 8;
  if ((poNumber ?? "").trim()) return 7;
  if (hasInvoice) return 2;
  return 1;
}

function parsePersistedItems(invoice?: JobInvoiceData | null): InvoiceItem[] {
  const raw = invoice?.requestPayloadJson?.trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as {
      lineItems?: Array<{
        itemCode?: string;
        description?: string;
        quantity?: number;
        unitAmount?: number;
        accountCode?: string;
        taxType?: string;
      }>;
    };

    return Array.isArray(parsed.lineItems)
      ? parsed.lineItems
          .filter((item) => typeof item?.description === "string" && item.description.trim())
          .map((item, index) => ({
            id: `line-${index + 1}`,
            itemCode: item.itemCode?.trim() || "",
            description: item.description!.trim(),
            quantity: typeof item.quantity === "number" ? item.quantity : 1,
            unitPrice: typeof item.unitAmount === "number" ? item.unitAmount : 0,
            discount: 0,
            account: item.accountCode?.trim() || "",
            taxRate: "15% GST on Income",
          }))
      : [];
  } catch {
    return [];
  }
}

function buildCorrelationId(jobId?: string, vehicle?: VehicleInfo | null) {
  const normalizedJobId = (jobId ?? "").trim();
  if (normalizedJobId) {
    const suffix = buildStableAlphaSuffix(normalizedJobId);
    return `PO-${normalizedJobId}-${suffix}`;
  }

  const plate = (vehicle?.plate ?? "").trim().replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return plate ? `PO-REGO-${plate}` : "PO-UNASSIGNED";
}

function buildStableAlphaSuffix(seed: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  let suffix = "";
  let value = hash || 1;
  for (let index = 0; index < 4; index += 1) {
    suffix += alphabet[value % alphabet.length];
    value = Math.floor(value / alphabet.length) || (hash + index + 7);
  }

  return suffix;
}

function resolveXeroStateOption(xeroStatus: XeroInvoiceStatus, latestPaymentMethod?: string) : XeroStateOption {
  if (xeroStatus === "PAID") {
    const method = latestPaymentMethod?.trim().toLowerCase();
    if (method === "cash") return "PAID_CASH";
    if (method === "epost") return "PAID_EPOST";
    return "PAID_BANK_TRANSFER";
  }
  return xeroStatus === "AUTHORISED" ? "AUTHORISED" : "DRAFT";
}

export function useInvoiceDashboardState({
  jobId,
  customer,
  vehicle,
  persistedPoNumber,
  persistedInvoiceReference,
  persistedInvoice,
}: UseInvoiceDashboardStateArgs = {}) {
  const toast = useToast();
  const [invoice, setInvoice] = useState(initialInvoiceState);
  const [items, setItems] = useState<InvoiceItem[]>(() => parsePersistedItems(persistedInvoice));
  const [itemCatalog, setItemCatalog] = useState(initialItemCatalog);
  const [timeline, setTimeline] = useState<EmailTimelineEvent[]>([]);
  const [detections, setDetections] = useState<PoDetection[]>([]);
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null);
  const [nextItemId, setNextItemId] = useState(parsePersistedItems(persistedInvoice).length + 1);
  const [itemCatalogSyncState, setItemCatalogSyncState] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [itemCatalogFeedback, setItemCatalogFeedback] = useState<string | null>(null);
  const [itemCatalogLastUpdated, setItemCatalogLastUpdated] = useState<string | null>(null);
  const [itemsDirty, setItemsDirty] = useState(!persistedInvoice);
  const [draftDirty, setDraftDirty] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [refreshingFromXero, setRefreshingFromXero] = useState(false);
  const [updatingXeroState, setUpdatingXeroState] = useState(false);
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const [pendingFocusRowId, setPendingFocusRowId] = useState<string | null>(null);
  const [manualPoNumber, setManualPoNumber] = useState("");
  const [poPanelLoading, setPoPanelLoading] = useState(true);
  const [poPanelInitialized, setPoPanelInitialized] = useState(false);
  const [poPanelRefreshing, setPoPanelRefreshing] = useState(false);
  const [merchantRecipientsLoading, setMerchantRecipientsLoading] = useState(true);
  const [savedPoNumber, setSavedPoNumber] = useState(persistedPoNumber?.trim() || "");
  const [savedInvoiceReference, setSavedInvoiceReference] = useState(persistedInvoiceReference?.trim() || "");
  const blocker = useBlocker(draftDirty || itemsDirty);
  const syncedSnapshotRef = useRef<InvoiceSnapshot>({
    invoice: initialInvoiceState,
    items: parsePersistedItems(persistedInvoice),
  });
  const leavePromptResolverRef = useRef<((decision: LeavePromptDecision) => void) | null>(null);
  const resolvedCorrelationId = useMemo(() => buildCorrelationId(jobId, vehicle), [jobId, vehicle]);
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + getBaseAmount(item), 0), [items]);
  const taxTotal = useMemo(() => items.reduce((sum, item) => sum + getTaxAmount(item), 0), [items]);
  const totalAmount = useMemo(() => subtotal + taxTotal, [subtotal, taxTotal]);
  const poLocked = invoice.xeroStatus === "PAID";
  const poLockReason = poLocked ? "Invoice is already marked as Paid in Xero. PO Request data is locked and can no longer be changed." : "";
  const referencePreview = useMemo<ReferencePreviewSource | null>(() => {
    const normalizedPo = savedPoNumber.trim().toUpperCase();
    if (!normalizedPo) return null;
    if (!invoice.reference.trim().toUpperCase().includes(normalizedPo)) return null;

    const matchedDetection = detections.find((item) => item.poNumber.trim().toUpperCase() === normalizedPo);
    if (!matchedDetection) return null;

    const latestReplyBody = timeline
      .filter((event) => event.type === "reply" && event.body?.trim())
      .map((event) => event.body?.trim() || "")
      .find(Boolean);

    return {
      kind: "po-detection",
      poNumber: matchedDetection.poNumber,
      label: matchedDetection.previewLabel || matchedDetection.attachmentFileName || matchedDetection.evidencePreview,
      previewType: matchedDetection.previewType,
      gmailMessageId: matchedDetection.gmailMessageId,
      attachmentFileName: matchedDetection.attachmentFileName,
      attachmentId: matchedDetection.attachmentId,
      attachmentMimeType: matchedDetection.attachmentMimeType,
      body: matchedDetection.previewType === "text" ? latestReplyBody || matchedDetection.evidencePreview : undefined,
    };
  }, [detections, savedPoNumber, timeline]);

  const buildDraftPayload = () => ({
    lineAmountTypes: "Inclusive",
    date: invoice.issueDate || new Date().toISOString().slice(0, 10),
    reference: invoice.reference,
    contactName: invoice.contact,
    lineItems: items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitAmount: item.unitPrice,
      itemCode: item.itemCode || undefined,
      accountCode: item.account || undefined,
      taxType: item.taxRate,
      discountRate: item.discount > 0 ? item.discount : undefined,
    })),
  });

  const cloneInvoiceState = (state: InvoiceDashboardState): InvoiceDashboardState => ({
    ...state,
    merchantEmails: [...state.merchantEmails],
    merchantEmailRecipients: state.merchantEmailRecipients.map((recipient) => ({ ...recipient })),
    emailStates: [...state.emailStates],
  });

  const cloneItems = (source: InvoiceItem[]) => source.map((item) => ({ ...item }));

  const applySnapshot = (snapshot: InvoiceSnapshot) => {
    setInvoice(cloneInvoiceState(snapshot.invoice));
    setItems(cloneItems(snapshot.items));
    setNextItemId(snapshot.items.length + 1);
    setItemsDirty(false);
    setDraftDirty(false);
    setPendingFocusRowId(null);
  };

  const requestLeaveDecision = () =>
    new Promise<LeavePromptDecision>((resolve) => {
      leavePromptResolverRef.current = resolve;
      setLeavePromptOpen(true);
    });

  const resolveLeavePrompt = (decision: LeavePromptDecision) => {
    setLeavePromptOpen(false);
    leavePromptResolverRef.current?.(decision);
    leavePromptResolverRef.current = null;
  };

  const persistDraftToDb = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!jobId) return true;

    setDraftSaving(true);
    try {
      const res = await saveJobInvoiceDraft(jobId, buildDraftPayload());
      if (!res.ok) {
        if (!silent) toast.error(res.error || "Failed to save invoice draft");
        return false;
      }

      const savedInvoice = res.data?.invoice;
      setInvoice((prev) => ({
        ...prev,
        reference: savedInvoice?.reference || prev.reference,
        issueDate: savedInvoice?.invoiceDate || prev.issueDate,
        invoiceNumber: savedInvoice?.externalInvoiceNumber || prev.invoiceNumber,
        xeroInvoiceId: savedInvoice?.externalInvoiceId || prev.xeroInvoiceId,
        xeroStatus: mapXeroStatus(savedInvoice?.externalStatus) || prev.xeroStatus,
        latestPaymentMethod: savedInvoice?.latestPayment?.method || prev.latestPaymentMethod,
        latestPaymentReference: savedInvoice?.latestPayment?.reference || prev.latestPaymentReference,
      }));
      setDraftDirty(false);
      return true;
    } finally {
      setDraftSaving(false);
    }
  };

  const confirmSaveBeforeLeaving = async () => {
    if (!draftDirty && !itemsDirty) return true;
    const decision = await requestLeaveDecision();
    if (decision === "stay") return false;
    if (decision === "discard") {
      const reverted = await discardChanges({ silent: true });
      return reverted;
    }
    if (!draftDirty) return true;
    return await persistDraftToDb();
  };

  const discardChanges = async ({ silent = false }: { silent?: boolean } = {}) => {
    const snapshot = syncedSnapshotRef.current;

    if (!jobId) {
      applySnapshot(snapshot);
      if (!silent) toast.info("Invoice changes discarded");
      return true;
    }

    setDraftSaving(true);
    try {
      const res = await saveJobInvoiceDraft(jobId, {
        lineAmountTypes: "Inclusive",
        date: snapshot.invoice.issueDate || new Date().toISOString().slice(0, 10),
        reference: snapshot.invoice.reference,
        contactName: snapshot.invoice.contact,
        lineItems: snapshot.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitAmount: item.unitPrice,
          itemCode: item.itemCode || undefined,
          accountCode: item.account || undefined,
          taxType: item.taxRate,
          discountRate: item.discount > 0 ? item.discount : undefined,
        })),
      });

      if (!res.ok) {
        if (!silent) toast.error(res.error || "Failed to discard invoice changes");
        return false;
      }

      applySnapshot(snapshot);
      if (!silent) toast.info("Invoice changes discarded");
      return true;
    } finally {
      setDraftSaving(false);
    }
  };

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
        if (field === "description" || field === "account" || field === "taxRate") {
          return { ...item, [field]: value };
        }
        const parsed = Number(value || 0);
        return { ...item, [field]: Number.isFinite(parsed) ? parsed : 0 };
      })
    );
    setInvoice((prev) => ({ ...prev, synced: false }));
    setItemsDirty(true);
    setDraftDirty(true);
  };

  const addItem = () => {
    const newId = `line-${nextItemId}`;
    setItems((prev) => [...prev, createNewItem(nextItemId)]);
    setNextItemId((prev) => prev + 1);
    setPendingFocusRowId(newId);
    setInvoice((prev) => ({ ...prev, synced: false }));
    setItemsDirty(true);
    setDraftDirty(true);
    toast.info("Added a new invoice item row");
  };

  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setInvoice((prev) => ({ ...prev, synced: false }));
    setItemsDirty(true);
    setDraftDirty(true);
    toast.info("Invoice item removed");
  };

  const syncInvoice = () => {
    if (!itemsDirty || !jobId) return;
    if (!EDITABLE_XERO_STATUSES.includes(invoice.xeroStatus)) {
      toast.error("This Xero invoice can no longer accept item changes from the system.");
      return;
    }

    const payload = {
      ...buildDraftPayload(),
      status: invoice.xeroStatus === "AUTHORISED" ? "AUTHORISED" : "DRAFT",
    };

    void syncJobXeroDraftInvoice(jobId, payload).then((res) => {
      if (!res.ok) {
        toast.error(res.error || "Failed to sync invoice with Xero");
        return;
      }

      const syncedInvoice = res.data?.invoice;
      const now = new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");

      setInvoice((prev) => ({
        ...prev,
        contact: syncedInvoice?.contactName || prev.contact,
        reference: syncedInvoice?.reference || prev.reference,
        issueDate: syncedInvoice?.invoiceDate || prev.issueDate,
        invoiceNumber: syncedInvoice?.externalInvoiceNumber || prev.invoiceNumber,
        xeroInvoiceId: syncedInvoice?.externalInvoiceId || prev.xeroInvoiceId,
        xeroStatus: mapXeroStatus(syncedInvoice?.externalStatus),
        latestPaymentMethod: syncedInvoice?.latestPayment?.method || prev.latestPaymentMethod,
        latestPaymentReference: syncedInvoice?.latestPayment?.reference || prev.latestPaymentReference,
        snapshotTotal: totalAmount,
        synced: true,
        status: resolveInvoiceStatus(syncedInvoice?.externalStatus, savedPoNumber) || prev.status,
        lastSyncTime: syncedInvoice?.updatedAt || now,
        lastSyncDirection: "System -> Xero",
        currentWorkflowStep: Math.max(prev.currentWorkflowStep, 2),
      }));

      if (typeof syncedInvoice?.requestPayloadJson === "string") {
        const nextItems = parsePersistedItems({
          id: syncedInvoice.id || "synced",
          jobId: syncedInvoice.jobId || jobId,
          provider: syncedInvoice.provider || "xero",
          requestPayloadJson: syncedInvoice.requestPayloadJson,
        });
        if (nextItems.length > 0) {
          setItems(nextItems);
          setNextItemId(nextItems.length + 1);
        }
      }

      setItemsDirty(false);
      setDraftDirty(false);
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
    });
  };

  const refreshFromXero = async () => {
    if (!jobId) return;

    setRefreshingFromXero(true);
    try {
      const res = await pullJobXeroDraftInvoice(jobId);
      if (!res.ok) {
        toast.error(res.error || "Failed to refresh invoice from Xero");
        return;
      }

      const pulledInvoice = res.data?.invoice;
      const now = new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");
      setInvoice((prev) => ({
        ...prev,
        contact: pulledInvoice?.contactName || prev.contact,
        reference: pulledInvoice?.reference || prev.reference,
        issueDate: pulledInvoice?.invoiceDate || prev.issueDate,
        invoiceNumber: pulledInvoice?.externalInvoiceNumber || prev.invoiceNumber,
        xeroInvoiceId: pulledInvoice?.externalInvoiceId || prev.xeroInvoiceId,
        xeroStatus: mapXeroStatus(pulledInvoice?.externalStatus),
        latestPaymentMethod: pulledInvoice?.latestPayment?.method || prev.latestPaymentMethod,
        latestPaymentReference: pulledInvoice?.latestPayment?.reference || prev.latestPaymentReference,
        status: resolveInvoiceStatus(pulledInvoice?.externalStatus, savedPoNumber) || prev.status,
        synced: true,
        lastSyncTime: pulledInvoice?.updatedAt || now,
        lastSyncDirection: "Xero -> System",
      }));

      if (typeof pulledInvoice?.requestPayloadJson === "string") {
        const nextItems = parsePersistedItems({
          id: pulledInvoice.id || "pulled",
          jobId: pulledInvoice.jobId || jobId,
          provider: pulledInvoice.provider || "xero",
          requestPayloadJson: pulledInvoice.requestPayloadJson,
        });
        if (nextItems.length > 0) {
          setItems(nextItems);
          setNextItemId(nextItems.length + 1);
          setItemsDirty(false);
          setDraftDirty(false);
        }
      }

      toast.success("Invoice refreshed from Xero");
    } finally {
      setRefreshingFromXero(false);
    }
  };

  const openInXero = () => {
    const invoiceId = invoice.xeroInvoiceId.trim();
    const url = invoiceId
      ? `https://go.xero.com/AccountsReceivable/View.aspx?invoiceID=${encodeURIComponent(invoiceId)}`
      : "https://go.xero.com";
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const refreshItemCatalog = () => {
    if (itemCatalogSyncState === "syncing") return;
    const startedAt = new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");
    setItemCatalogSyncState("syncing");
    setItemCatalogFeedback("Syncing item list from inventory_items. Existing invoice rows stay untouched until you choose an item.");
    toast.info("Refreshing inventory item list...");

    void requestJson<Array<{
      code: string;
      name: string;
      description: string;
      unitPrice: number;
      account: string;
      taxRate: string;
      status: string;
    }>>("/api/inventory-items/import", {
      method: "POST",
    }).then((importRes) => {
      if (!importRes.ok) {
        throw new Error(importRes.error || "Failed to update inventory items");
      }

      return requestJson<Array<{
        code: string;
        name: string;
        description: string;
        unitPrice: number;
        account: string;
        taxRate: string;
        status: string;
      }>>("/api/inventory-items?limit=200");
    }).then((res) => {
      if (!res.ok || !Array.isArray(res.data)) {
        throw new Error(res.error || "Failed to load inventory items");
      }

      setItemCatalog(
        res.data.map((item) => ({
          code: item.code,
          name: item.description?.trim() || item.name,
          unitPrice: Number(item.unitPrice || 0),
          account: item.account?.trim() || "",
          taxRate: normalizeTaxRate(item.taxRate),
        }))
      );
      setItemCatalogSyncState("success");
      setItemCatalogLastUpdated(startedAt);
      setItemCatalogFeedback("Inventory item list updated from database.");
      toast.success("Inventory item list updated");
    }).catch((error: unknown) => {
      setItemCatalogSyncState("error");
      setItemCatalogFeedback(error instanceof Error ? error.message : "Failed to update inventory items");
      toast.error(error instanceof Error ? error.message : "Failed to update inventory items");
    });
  };

  useEffect(() => {
    let cancelled = false;

    const loadInitialItemCatalog = async () => {
      const res = await requestJson<Array<{
        code: string;
        name: string;
        description: string;
        unitPrice: number;
        account: string;
        taxRate: string;
        status: string;
      }>>("/api/inventory-items?limit=200");

      if (!res.ok || !Array.isArray(res.data) || cancelled) {
        return;
      }

      setItemCatalog(
        res.data.map((item) => ({
          code: item.code,
          name: item.description?.trim() || item.name,
          unitPrice: Number(item.unitPrice || 0),
          account: item.account?.trim() || "",
          taxRate: normalizeTaxRate(item.taxRate),
        }))
      );
      setItemCatalogLastUpdated(new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-"));
    };

    void loadInitialItemCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  const sendPoRequest = async ({ to, subject, body }: { to: string; subject: string; body: string }) => {
    if (poLocked) {
      throw new Error(poLockReason);
    }

    const draftSaved = await persistDraftToDb();
    if (!draftSaved) {
      throw new Error("Failed to save invoice draft before sending PO request");
    }

    const latestThreadEvent = timeline.find((event) => ["sent", "reminder", "reply"].includes(event.type));
    const result = await requestJson<{
      id: string;
      threadId: string;
      message: string;
      rfcMessageId: string;
      referencesHeader: string;
    }>("/api/gmail/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        subject,
        body,
        correlationId: invoice.correlationId,
        threadId: latestThreadEvent?.threadId || null,
        replyToRfcMessageId: latestThreadEvent?.rfcMessageId || null,
        referencesHeader: latestThreadEvent?.referencesHeader || null,
      }),
    });

    if (!result.ok) {
      throw new Error(result.error || "Failed to send PO request email");
    }

    const now = new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");
    setInvoice((prev) => ({
      ...prev,
      selectedMerchantEmail: to,
      emailStates: mergeEmailStates(prev.emailStates, ["Email Sent"], ["Draft"]),
      currentWorkflowStep: Math.max(prev.currentWorkflowStep, 3),
      lastEmailSent: now,
      nextReminderIn: "23h 59m",
    }));
    setTimeline((prev) => [
      {
        id: `evt-send-${Date.now()}`,
        type: "sent",
        timestamp: now,
        description: `PO request email sent to ${to}${result.data?.threadId ? ` (thread ${result.data.threadId})` : ""}`,
        to,
        subject,
        body,
        threadId: result.data?.threadId || latestThreadEvent?.threadId,
        rfcMessageId: result.data?.rfcMessageId || "",
        referencesHeader: result.data?.referencesHeader || "",
        attachments: [],
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
      emailStates: mergeEmailStates(prev.emailStates, ["Reminder Scheduled"], ["Draft"]),
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

  const configureReminders = () => {
    toast.info("Reminder settings coming next");
  };

  const persistPoSelection = async (poNumber: string, invoiceReference: string) => {
    if (!jobId) return true;

    const res = await updateJobPoSelection(jobId, {
      poNumber,
      invoiceReference,
    });

    if (!res.ok) {
      toast.error(res.error || "Failed to save PO selection");
      return false;
    }

    setSavedPoNumber((res.data?.poNumber as string | undefined)?.trim() || poNumber);
    setSavedInvoiceReference((res.data?.invoiceReference as string | undefined)?.trim() || invoiceReference);

    return true;
  };

  const syncPoReference = async (poNumber: string, sourceLabel: string) => {
    const nextPo = poNumber.trim();
    if (!nextPo) {
      toast.error("Please enter a PO number");
      return false;
    }
    const nextReference = buildReference(invoice.reference, nextPo);
    const persistedPo = extractPoFromReference(nextReference) || nextPo;
    const now = new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");
    const persisted = await persistPoSelection(persistedPo, nextReference);
    if (!persisted) {
      return false;
    }

    let syncedInvoice: any = null;
    let xeroSyncFailed = false;
    if (jobId && (invoice.xeroInvoiceId || persistedInvoice?.externalInvoiceId)) {
      const syncRes = await syncJobXeroDraftInvoice(jobId, {
        ...buildDraftPayload(),
        reference: nextReference,
      });

      if (!syncRes.ok) {
        xeroSyncFailed = true;
        toast.error(syncRes.error || "Failed to update invoice reference in Xero");
      } else {
        syncedInvoice = syncRes.data?.invoice;
      }
    }

    setInvoice((prev) => ({
      ...prev,
      contact: syncedInvoice?.contactName || prev.contact,
      reference: syncedInvoice?.reference || nextReference,
      issueDate: syncedInvoice?.invoiceDate || prev.issueDate,
      invoiceNumber: syncedInvoice?.externalInvoiceNumber || prev.invoiceNumber,
      xeroInvoiceId: syncedInvoice?.externalInvoiceId || prev.xeroInvoiceId,
      xeroStatus: mapXeroStatus(syncedInvoice?.externalStatus || "DRAFT"),
      latestPaymentMethod: syncedInvoice?.latestPayment?.method || prev.latestPaymentMethod,
      latestPaymentReference: syncedInvoice?.latestPayment?.reference || prev.latestPaymentReference,
      status: "PO Received",
      currentWorkflowStep: Math.max(prev.currentWorkflowStep, 7),
      synced: !xeroSyncFailed && Boolean(syncedInvoice || prev.xeroInvoiceId),
      lastSyncTime: syncedInvoice?.updatedAt || now,
      lastSyncDirection: "System -> Xero",
    }));
    setManualPoNumber(persistedPo);
    setTimeline((prev) => [
      {
        id: `evt-ref-${Date.now()}`,
        type: "updated",
        timestamp: now,
        description: xeroSyncFailed
          ? `${persistedPo} saved from ${sourceLabel}, but Xero reference update failed`
          : `${persistedPo} synced to invoice reference in Xero from ${sourceLabel}`,
      },
      ...prev,
    ]);
    if (!xeroSyncFailed) {
      toast.success("Invoice reference updated in Xero");
    }
    return true;
  };

  const saveReference = async (nextReferenceRaw: string) => {
    const nextReference = nextReferenceRaw.trim();
    if (!jobId) return false;
    if (!nextReference) {
      toast.error("Reference cannot be empty");
      return false;
    }

    const res = await syncJobXeroDraftInvoice(jobId, {
      ...buildDraftPayload(),
      reference: nextReference,
    });

    if (!res.ok) {
      toast.error(res.error || "Failed to update reference in Xero");
      return false;
    }

    const syncedInvoice = res.data?.invoice;
    const now = new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");
    setInvoice((prev) => ({
      ...prev,
      contact: syncedInvoice?.contactName || prev.contact,
      reference: syncedInvoice?.reference || nextReference,
      issueDate: syncedInvoice?.invoiceDate || prev.issueDate,
      invoiceNumber: syncedInvoice?.externalInvoiceNumber || prev.invoiceNumber,
      xeroInvoiceId: syncedInvoice?.externalInvoiceId || prev.xeroInvoiceId,
      xeroStatus: mapXeroStatus(syncedInvoice?.externalStatus),
      latestPaymentMethod: syncedInvoice?.latestPayment?.method || prev.latestPaymentMethod,
      latestPaymentReference: syncedInvoice?.latestPayment?.reference || prev.latestPaymentReference,
      status: resolveInvoiceStatus(syncedInvoice?.externalStatus, savedPoNumber) || prev.status,
      synced: true,
      lastSyncTime: syncedInvoice?.updatedAt || now,
      lastSyncDirection: "System -> Xero",
    }));
    setSavedInvoiceReference(nextReference);
    setDraftDirty(false);
    setItemsDirty(false);
    toast.success("Reference updated in Xero");
    return true;
  };

  const confirmPo = async (id: string) => {
    if (poLocked) {
      toast.error(poLockReason);
      return;
    }

    const po = detections.find((item) => item.id === id);
    if (!po) return;
    const synced = await syncPoReference(po.poNumber, "PO Detection");
    if (!synced) return;
    setDetections((prev) => applyDetectionSelection(prev, id));
    setSelectedDetectionId(id);
    setInvoice((prev) => ({
      ...prev,
      emailStates: mergeEmailStates(prev.emailStates, ["Get Reply", "Get PO"], ["Draft"]),
    }));
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

  const syncManualPoToInvoiceReference = async () => {
    if (poLocked) {
      toast.error(poLockReason);
      return;
    }

    const synced = await syncPoReference(manualPoNumber, "manual input");
    if (!synced) return;
    setSelectedDetectionId(null);
    setDetections((prev) => applyDetectionSelection(prev, null));
  };

  useEffect(() => {
    const nextInvoice: InvoiceDashboardState = {
      ...initialInvoiceState,
      correlationId: resolvedCorrelationId,
      reference: persistedInvoice?.reference?.trim() || "",
      issueDate: persistedInvoice?.invoiceDate || "",
      invoiceNumber: persistedInvoice?.externalInvoiceNumber || "",
      xeroInvoiceId: persistedInvoice?.externalInvoiceId || "",
      status: persistedInvoice ? resolveInvoiceStatus(persistedInvoice.externalStatus, persistedPoNumber) : savedPoNumber ? "PO Received" : initialInvoiceState.status,
      xeroStatus: persistedInvoice ? mapXeroStatus(persistedInvoice.externalStatus) : initialInvoiceState.xeroStatus,
      currentWorkflowStep: resolveWorkflowStep(persistedInvoice?.externalStatus, persistedPoNumber ?? savedPoNumber, Boolean(persistedInvoice)),
      synced: Boolean(persistedInvoice),
      lastSyncTime: persistedInvoice?.updatedAt || "",
      lastSyncDirection: persistedInvoice ? "Xero -> System" : initialInvoiceState.lastSyncDirection,
      latestPaymentMethod: persistedInvoice?.latestPayment?.method || "",
      latestPaymentReference: persistedInvoice?.latestPayment?.reference || "",
      selectedMerchantEmail: "",
      merchantEmails: [],
      merchantEmailRecipients: [],
      emailStates: ["Draft"],
      lastReplyReceived: "No reply yet",
      lastEmailSent: "",
      nextReminderIn: "NaNh NaNm",
    };
    setInvoice((prev) => ({
      ...prev,
      ...nextInvoice,
    }));
    const persistedItems = parsePersistedItems(persistedInvoice);
    setItems(persistedItems);
    setNextItemId(persistedItems.length + 1);
    setItemsDirty(!persistedInvoice);
    setDraftDirty(false);
    setTimeline([]);
    setDetections([]);
    setSelectedDetectionId(null);
    setManualPoNumber((persistedPoNumber?.trim() || "") || (!persistedInvoice ? getLegacyPoFromReference(persistedInvoiceReference?.trim() || "") : ""));
    setPoPanelLoading(true);
    setPoPanelInitialized(false);
    setPoPanelRefreshing(false);
    setMerchantRecipientsLoading(true);
    syncedSnapshotRef.current = {
      invoice: cloneInvoiceState(nextInvoice),
      items: cloneItems(persistedItems),
    };
  }, [persistedInvoice, persistedInvoiceReference, persistedPoNumber, resolvedCorrelationId]);

  useEffect(() => {
    if (!draftDirty || !jobId) return;

    const timer = window.setTimeout(() => {
      void persistDraftToDb({ silent: true });
    }, 800);

    return () => window.clearTimeout(timer);
  }, [draftDirty, jobId, items, invoice.contact, invoice.issueDate, invoice.reference]);

  useEffect(() => {
    if (draftDirty || itemsDirty) return;
    syncedSnapshotRef.current = {
      invoice: cloneInvoiceState(invoice),
      items: cloneItems(items),
    };
  }, [draftDirty, itemsDirty, invoice, items]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!draftDirty && !itemsDirty && !draftSaving) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [draftDirty, itemsDirty, draftSaving]);

  useEffect(() => {
    setSavedPoNumber(persistedPoNumber?.trim() || "");
    setSavedInvoiceReference(persistedInvoiceReference?.trim() || "");
  }, [persistedPoNumber, persistedInvoiceReference]);

  useEffect(() => {
    setInvoice((prev) => {
      const nextReference = savedInvoiceReference || prev.reference;
      const hasSavedSelection = Boolean(savedPoNumber);

      return {
        ...prev,
        reference: nextReference,
        status: hasSavedSelection && prev.status !== "Awaiting Payment" ? "PO Received" : prev.status,
        currentWorkflowStep: hasSavedSelection ? 7 : prev.currentWorkflowStep,
        emailStates: hasSavedSelection ? mergeEmailStates(prev.emailStates, ["Get PO"], ["Draft"]) : prev.emailStates,
      };
    });
    setManualPoNumber((prev) => savedPoNumber || prev || (!persistedInvoice ? getLegacyPoFromReference(savedInvoiceReference) : ""));
  }, [persistedInvoice, savedPoNumber, savedInvoiceReference]);

  useEffect(() => {
    let cancelled = false;

    const refreshThreadEvents = async () => {
      if (!poPanelInitialized && merchantRecipientsLoading) {
        setPoPanelLoading(true);
        return;
      }

      if (!invoice.selectedMerchantEmail || !invoice.correlationId) {
        setTimeline((prev) => prev.filter((event) => !["sent", "reminder", "reply"].includes(event.type)));
        setDetections([]);
        setPoPanelLoading(false);
        setPoPanelInitialized(true);
        setPoPanelRefreshing(false);
        return;
      }

      if (!poPanelInitialized) {
        setPoPanelLoading(true);
      } else {
        setPoPanelRefreshing(true);
      }
      const res = await requestJson<{
        events: EmailTimelineEvent[];
        unreadReplyCount: number;
        hasReply: boolean;
        hasPo: boolean;
        detectedPoNumber: string;
        lastReplyTimestamp: string;
      }>(
        `/api/gmail/thread?counterpartyEmail=${encodeURIComponent(invoice.selectedMerchantEmail)}&correlationId=${encodeURIComponent(invoice.correlationId)}`
      );

      if (!res.ok || !res.data || !Array.isArray(res.data.events) || cancelled) {
        setTimeline((prev) => prev.filter((event) => !["sent", "reminder", "reply"].includes(event.type)));
        setDetections([]);
        setPoPanelLoading(false);
        setPoPanelInitialized(true);
        setPoPanelRefreshing(false);
        return;
      }
      const threadData = res.data;

      const detectionRes = await requestJson<PoDetection[]>(
        `/api/gmail/po-detections?counterpartyEmail=${encodeURIComponent(invoice.selectedMerchantEmail)}&correlationId=${encodeURIComponent(invoice.correlationId)}`
      );
      const nextDetections =
        detectionRes.ok && Array.isArray(detectionRes.data)
          ? detectionRes.data.map((item) => ({
              ...item,
              status: item.status ?? "pending",
            }))
          : [];
      const hasDetectedPo = Boolean(threadData.hasPo || nextDetections.length > 0);
      const resolvedSelectedDetectionId =
        selectedDetectionId && nextDetections.some((item) => item.id === selectedDetectionId)
          ? selectedDetectionId
          : savedPoNumber
            ? nextDetections.find((item) => item.poNumber.trim().toUpperCase() === savedPoNumber.toUpperCase())?.id ?? null
          : null;

      setTimeline((prev) => {
        const nonThreadEvents = prev.filter((event) => !["sent", "reminder", "reply"].includes(event.type));
        return [...threadData.events, ...nonThreadEvents];
      });
      setSelectedDetectionId(resolvedSelectedDetectionId);
      setDetections(applyDetectionSelection(nextDetections, resolvedSelectedDetectionId));

      setInvoice((prev) => ({
        ...prev,
        emailStates:
          threadData.events.length === 0
            ? ["Draft"]
            : EMAIL_STATE_ORDER.filter((state) =>
                [
                  "Email Sent",
                  ...(threadData.events.some((event) => event.type === "reminder") ? (["Reminder Scheduled"] as const) : []),
                  ...(threadData.hasReply ? (["Get Reply"] as const) : []),
                  ...(hasDetectedPo ? (["Get PO"] as const) : []),
                ].includes(state)
              ),
        lastReplyReceived: threadData.lastReplyTimestamp || prev.lastReplyReceived,
      }));

      if (savedPoNumber) {
        setManualPoNumber(savedPoNumber);
      } else if (threadData.detectedPoNumber) {
        setManualPoNumber(threadData.detectedPoNumber);
      } else if (nextDetections.length > 0) {
        setManualPoNumber((prev) => prev || nextDetections[0].poNumber);
      }

      if (!cancelled) {
        notifyPoDashboardRefresh();
        setPoPanelLoading(false);
        setPoPanelInitialized(true);
        setPoPanelRefreshing(false);
      }
    };

    void refreshThreadEvents();
    const timer = window.setInterval(() => {
      void refreshThreadEvents();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    invoice.selectedMerchantEmail,
    invoice.correlationId,
    selectedDetectionId,
    poPanelInitialized,
    merchantRecipientsLoading,
    savedPoNumber,
  ]);

  const unreadReplyCount = timeline.filter((event) => event.type === "reply" && event.unread).length;

  const markPoThreadSeen = async () => {
    if (!invoice.selectedMerchantEmail || !invoice.correlationId) return;

    const res = await requestJson<{ updated: number }>("/api/gmail/thread/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        counterpartyEmail: invoice.selectedMerchantEmail,
        correlationId: invoice.correlationId,
      }),
    });

    if (!res.ok) return;

    setTimeline((prev) =>
      prev.map((event) => (event.type === "reply" ? { ...event, unread: false } : event))
    );
  };

  useEffect(() => {
    let cancelled = false;

    const loadMerchantRecipients = async () => {
      setMerchantRecipientsLoading(true);

      if (customer?.type?.toLowerCase() !== "business" || !customer.name.trim()) {
        setInvoice((prev) => ({
          ...prev,
          contact: persistedInvoice?.contactName?.trim() || customer?.name?.trim() || prev.contact,
          merchantUserName: "team",
          merchantEmails: [],
          merchantEmailRecipients: [],
          selectedMerchantEmail: "",
          vehicleRego: vehicle?.plate || prev.vehicleRego,
          vehicleModel: vehicle?.model || prev.vehicleModel,
          vehicleMake: vehicle?.make || prev.vehicleMake,
        }));
        if (!cancelled) setMerchantRecipientsLoading(false);
        return;
      }

      const res = await requestJson<Array<{
        id: string;
        type: string;
        name: string;
        email: string;
        businessCode: string;
        staffMembers?: Array<{ name: string; title: string; email: string }>;
      }>>("/api/customers");

      if (!res.ok || !Array.isArray(res.data) || cancelled) {
        setInvoice((prev) => ({
          ...prev,
          contact: persistedInvoice?.contactName?.trim() || customer.name.trim(),
          merchantUserName: "team",
          merchantEmails: customer.email?.trim() ? [customer.email.trim()] : [],
          merchantEmailRecipients: customer.email?.trim()
            ? [{ email: customer.email.trim(), kind: "business", name: "Team", title: "" }]
            : [],
          selectedMerchantEmail: customer.email?.trim() || "",
          vehicleRego: vehicle?.plate || prev.vehicleRego,
          vehicleModel: vehicle?.model || prev.vehicleModel,
          vehicleMake: vehicle?.make || prev.vehicleMake,
        }));
        if (!cancelled) setMerchantRecipientsLoading(false);
        return;
      }

      const normalizedBusinessCode = (customer.businessCode ?? "").trim().toLowerCase();
      const normalizedName = customer.name.trim().toLowerCase();
      const matched = res.data.find((row) => {
        if ((row.type ?? "").toLowerCase() !== "business") return false;
        const rowBusinessCode = (row.businessCode ?? "").trim().toLowerCase();
        const rowName = (row.name ?? "").trim().toLowerCase();
        return (normalizedBusinessCode && rowBusinessCode === normalizedBusinessCode) || rowName === normalizedName;
      });

      const recipients: MerchantEmailRecipient[] = [];
      const seen = new Set<string>();
      const pushRecipient = (recipient: MerchantEmailRecipient | null) => {
        if (!recipient) return;
        const key = recipient.email.trim().toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        recipients.push(recipient);
      };

      pushRecipient(
        matched?.email?.trim()
          ? { email: matched.email.trim(), kind: "business", name: "Team", title: "" }
          : customer.email?.trim()
            ? { email: customer.email.trim(), kind: "business", name: "Team", title: "" }
            : null
      );

      for (const staff of matched?.staffMembers ?? []) {
        if (!staff?.email?.trim()) continue;
        pushRecipient({
          email: staff.email.trim(),
          kind: "staff",
          name: staff.name?.trim() || "staff",
          title: staff.title?.trim() || "",
        });
      }

      if (cancelled) return;

      setInvoice((prev) => ({
        ...prev,
        contact: persistedInvoice?.contactName?.trim() || matched?.name?.trim() || customer.name.trim(),
        merchantUserName:
          recipients.find((item) => item.kind === "staff")?.name ||
          (recipients[0]?.kind === "business" ? "team" : prev.merchantUserName),
        merchantEmails: recipients.map((item) => item.email),
        merchantEmailRecipients: recipients,
        selectedMerchantEmail:
          recipients.some((item) => item.email === prev.selectedMerchantEmail)
            ? prev.selectedMerchantEmail
            : (recipients[0]?.email ?? ""),
        vehicleRego: vehicle?.plate || prev.vehicleRego,
        vehicleModel: vehicle?.model || prev.vehicleModel,
        vehicleMake: vehicle?.make || prev.vehicleMake,
      }));
      setMerchantRecipientsLoading(false);
    };

    void loadMerchantRecipients();
    return () => {
      cancelled = true;
    };
  }, [customer, persistedInvoice, vehicle]);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    let cancelled = false;

    void (async () => {
      const shouldProceed = await confirmSaveBeforeLeaving();
      if (cancelled) return;
      if (shouldProceed) {
        blocker.proceed();
      } else {
        blocker.reset();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blocker]);

  const updateXeroState = async (state: XeroStateOption, epostReferenceId?: string) => {
    if (!jobId) return false;

    setUpdatingXeroState(true);
    try {
      const res = await updateJobInvoiceXeroState(jobId, {
        state,
        epostReferenceId: epostReferenceId?.trim() || undefined,
      });

      if (!res.ok) {
        toast.error(res.error || "Failed to update Xero invoice status");
        return false;
      }

      const updatedInvoice = res.data?.invoice;
      const now = new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");
      setInvoice((prev) => ({
        ...prev,
        reference: updatedInvoice?.reference || prev.reference,
        issueDate: updatedInvoice?.invoiceDate || prev.issueDate,
        invoiceNumber: updatedInvoice?.externalInvoiceNumber || prev.invoiceNumber,
        xeroInvoiceId: updatedInvoice?.externalInvoiceId || prev.xeroInvoiceId,
        xeroStatus: mapXeroStatus(updatedInvoice?.externalStatus),
        latestPaymentMethod: updatedInvoice?.latestPayment?.method || prev.latestPaymentMethod,
        latestPaymentReference: updatedInvoice?.latestPayment?.reference || prev.latestPaymentReference,
        status: resolveInvoiceStatus(updatedInvoice?.externalStatus, savedPoNumber) || prev.status,
        lastSyncTime: updatedInvoice?.updatedAt || now,
        lastSyncDirection: "System -> Xero",
        currentWorkflowStep: resolveWorkflowStep(updatedInvoice?.externalStatus, savedPoNumber, true),
        synced: true,
      }));
      toast.success("Xero invoice status updated");
      return true;
    } finally {
      setUpdatingXeroState(false);
    }
  };

  return {
    invoice,
    items,
    itemCatalog,
    timeline,
    detections,
    selectedDetectionId,
    itemCatalogSyncState,
    itemCatalogFeedback,
    itemCatalogLastUpdated,
    itemsDirty,
    draftDirty,
    leavePromptOpen,
    refreshingFromXero,
    updatingXeroState,
    referencePreview,
    pendingFocusRowId,
    poPanelLoading,
    poPanelRefreshing,
    poLocked,
    poLockReason,
    unreadReplyCount,
    subtotal,
    taxTotal,
    totalAmount,
    manualPoNumber,
    setSelectedDetectionId,
    setPendingFocusRowId,
    setManualPoNumber,
    updateItem,
    addItem,
    deleteItem,
    syncInvoice,
    updateXeroState,
    resolveXeroStateOption,
    discardChanges,
    refreshFromXero,
    openInXero,
    saveReference,
    confirmSaveBeforeLeaving,
    resolveLeavePrompt,
    refreshItemCatalog,
    sendPoRequest,
    sendReminderNow,
    configureReminders,
    confirmPo,
    rejectPo,
    syncManualPoToInvoiceReference,
    markPoThreadSeen,
  };
}

export type InvoiceDashboardModel = ReturnType<typeof useInvoiceDashboardState>;
