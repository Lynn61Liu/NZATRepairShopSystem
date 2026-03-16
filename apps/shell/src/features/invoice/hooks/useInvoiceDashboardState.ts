import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui";
import { requestJson } from "@/utils/api";
import { saveJobInvoiceDraft, syncJobXeroDraftInvoice, updateJobPoSelection } from "@/features/jobDetail/api/jobDetailApi";
import type {
  EmailState,
  EmailTimelineEvent,
  InvoiceDashboardState,
  InvoiceItem,
  MerchantEmailRecipient,
  PoDetection,
  TaxRateOption,
  XeroItemDefinition,
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
};

const initialItemCatalog: XeroItemDefinition[] = [];

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

function mapExternalStatus(status?: string | null): InvoiceDashboardState["status"] {
  const normalized = status?.trim().toUpperCase();
  switch (normalized) {
    case "AUTHORISED":
      return "Authorised";
    case "PAID":
      return "Awaiting Payment";
    case "DRAFT":
      return "Draft";
    default:
      return "Awaiting PO";
  }
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
  const [pendingFocusRowId, setPendingFocusRowId] = useState<string | null>(null);
  const [manualPoNumber, setManualPoNumber] = useState("");
  const [poPanelLoading, setPoPanelLoading] = useState(true);
  const [poPanelInitialized, setPoPanelInitialized] = useState(false);
  const [poPanelRefreshing, setPoPanelRefreshing] = useState(false);
  const [merchantRecipientsLoading, setMerchantRecipientsLoading] = useState(true);
  const [savedPoNumber, setSavedPoNumber] = useState(persistedPoNumber?.trim() || "");
  const [savedInvoiceReference, setSavedInvoiceReference] = useState(persistedInvoiceReference?.trim() || "");
  const resolvedCorrelationId = useMemo(() => buildCorrelationId(jobId, vehicle), [jobId, vehicle]);
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + getBaseAmount(item), 0), [items]);
  const taxTotal = useMemo(() => items.reduce((sum, item) => sum + getTaxAmount(item), 0), [items]);
  const totalAmount = useMemo(() => subtotal + taxTotal, [subtotal, taxTotal]);

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
      }));
      setDraftDirty(false);
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

    const payload = {
      ...buildDraftPayload(),
      status: "DRAFT",
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
        reference: syncedInvoice?.reference || prev.reference,
        issueDate: syncedInvoice?.invoiceDate || prev.issueDate,
        invoiceNumber: syncedInvoice?.externalInvoiceNumber || prev.invoiceNumber,
        xeroInvoiceId: syncedInvoice?.externalInvoiceId || prev.xeroInvoiceId,
        snapshotTotal: totalAmount,
        synced: true,
        status: mapExternalStatus(syncedInvoice?.externalStatus) || prev.status,
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
    setInvoice((prev) => ({
      ...prev,
      reference: nextReference,
      status: "PO Received",
      currentWorkflowStep: Math.max(prev.currentWorkflowStep, 7),
      lastSyncTime: now,
      lastSyncDirection: "System -> Xero",
    }));
    setManualPoNumber(persistedPo);
    setTimeline((prev) => [
      {
        id: `evt-ref-${Date.now()}`,
        type: "updated",
        timestamp: now,
        description: `${persistedPo} synced to invoice reference from ${sourceLabel}`,
      },
      ...prev,
    ]);
    toast.success("Invoice reference updated");
    return true;
  };

  const confirmPo = async (id: string) => {
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
    const synced = await syncPoReference(manualPoNumber, "manual input");
    if (!synced) return;
    setSelectedDetectionId(null);
    setDetections((prev) => applyDetectionSelection(prev, null));
  };

  useEffect(() => {
    setInvoice((prev) => ({
      ...prev,
      correlationId: resolvedCorrelationId,
      reference: persistedInvoice?.reference?.trim() || savedInvoiceReference,
      issueDate: persistedInvoice?.invoiceDate || "",
      invoiceNumber: persistedInvoice?.externalInvoiceNumber || "",
      xeroInvoiceId: persistedInvoice?.externalInvoiceId || "",
      status: persistedInvoice ? mapExternalStatus(persistedInvoice.externalStatus) : savedPoNumber ? "PO Received" : prev.status,
      synced: Boolean(persistedInvoice),
      lastSyncTime: persistedInvoice?.updatedAt || "",
      lastSyncDirection: persistedInvoice ? "Xero -> System" : prev.lastSyncDirection,
      selectedMerchantEmail: "",
      merchantEmails: [],
      merchantEmailRecipients: [],
      emailStates: ["Draft"],
      lastReplyReceived: "No reply yet",
      lastEmailSent: "",
      nextReminderIn: "NaNh NaNm",
    }));
    const persistedItems = parsePersistedItems(persistedInvoice);
    setItems(persistedItems);
    setNextItemId(persistedItems.length + 1);
    setItemsDirty(!persistedInvoice);
    setDraftDirty(false);
    setTimeline([]);
    setDetections([]);
    setSelectedDetectionId(null);
    setManualPoNumber(savedPoNumber || (!persistedInvoice ? getLegacyPoFromReference(savedInvoiceReference) : ""));
    setPoPanelLoading(true);
    setPoPanelInitialized(false);
    setPoPanelRefreshing(false);
    setMerchantRecipientsLoading(true);
  }, [persistedInvoice, resolvedCorrelationId, savedInvoiceReference, savedPoNumber]);

  useEffect(() => {
    if (!draftDirty || !jobId) return;

    const timer = window.setTimeout(() => {
      void persistDraftToDb({ silent: true });
    }, 800);

    return () => window.clearTimeout(timer);
  }, [draftDirty, jobId, items, invoice.contact, invoice.issueDate, invoice.reference]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!draftDirty && !draftSaving) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [draftDirty, draftSaving]);

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
        status: hasSavedSelection ? "PO Received" : prev.status,
        currentWorkflowStep: hasSavedSelection ? Math.max(prev.currentWorkflowStep, 7) : prev.currentWorkflowStep,
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
    pendingFocusRowId,
    poPanelLoading,
    poPanelRefreshing,
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
    openInXero,
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
