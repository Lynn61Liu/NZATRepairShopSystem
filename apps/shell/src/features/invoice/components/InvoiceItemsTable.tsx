import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, GripVertical, Loader2, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { Button, Input, Select } from "@/components/ui";
import type { AmountsAre, InvoiceItem, TaxRateOption, XeroItemDefinition } from "../types";
import { useInvoiceDisplay } from "./InvoiceDisplayContext";

type ItemCatalogSyncState = "idle" | "syncing" | "success" | "error";

type Props = {
  items: InvoiceItem[];
  amountsAre: AmountsAre;
  readOnly?: boolean;
  synced: boolean;
  subtotal: number;
  taxTotal: number;
  totalAmount: number;
  itemCatalog: XeroItemDefinition[];
  itemCatalogSyncState: ItemCatalogSyncState;
  itemCatalogFeedback: string | null;
  itemCatalogLastUpdated: string | null;
  pendingFocusRowId: string | null;
  onAddItem: () => void;
  onChangeItem: (id: string, field: keyof InvoiceItem, value: string) => void;
  onDeleteItem: (id: string) => void;
  onRefreshItemCatalog: () => void;
  onPendingFocusHandled: () => void;
};

const TAX_RATE_OPTIONS: TaxRateOption[] = [
  "15% GST on Expenses",
  "15% GST on Income",
  "GST on Imports",
  "No GST",
  "Zero Rated",
  "Zero Rated - Exp",
];

const TAX_RATE_PERCENTAGE: Record<TaxRateOption, number> = {
  "15% GST on Expenses": 15,
  "15% GST on Income": 15,
  "GST on Imports": 15,
  "No GST": 0,
  "Zero Rated": 0,
  "Zero Rated - Exp": 0,
};

function getEnteredAmount(item: InvoiceItem) {
  return item.quantity * item.unitPrice * (1 - item.discount / 100);
}

function getBaseAmount(item: InvoiceItem, amountsAre: AmountsAre) {
  if (typeof item.xeroLineAmount === "number" && Number.isFinite(item.xeroLineAmount)) {
    if (amountsAre === "Tax Inclusive" && typeof item.xeroTaxAmount === "number" && Number.isFinite(item.xeroTaxAmount)) {
      return item.xeroLineAmount - item.xeroTaxAmount;
    }
    return item.xeroLineAmount;
  }

  const entered = getEnteredAmount(item);
  const rate = TAX_RATE_PERCENTAGE[item.taxRate];
  if (amountsAre !== "Tax Inclusive" || rate <= 0) {
    return entered;
  }

  return entered / (1 + rate / 100);
}

function getTaxAmount(item: InvoiceItem, amountsAre: AmountsAre) {
  if (typeof item.xeroTaxAmount === "number" && Number.isFinite(item.xeroTaxAmount)) {
    return item.xeroTaxAmount;
  }

  if (amountsAre === "No Tax") return 0;

  const entered = getEnteredAmount(item);
  const rate = TAX_RATE_PERCENTAGE[item.taxRate];
  if (rate <= 0) return 0;

  if (amountsAre === "Tax Inclusive") {
    return entered - getBaseAmount(item, amountsAre);
  }

  return entered * (rate / 100);
}

function getLineAmount(item: InvoiceItem, amountsAre: AmountsAre) {
  if (typeof item.xeroLineAmount === "number" && Number.isFinite(item.xeroLineAmount)) {
    if (amountsAre === "Tax Exclusive" && typeof item.xeroTaxAmount === "number" && Number.isFinite(item.xeroTaxAmount)) {
      return item.xeroLineAmount + item.xeroTaxAmount;
    }
    return item.xeroLineAmount;
  }

  if (amountsAre === "No Tax") {
    return getBaseAmount(item, amountsAre);
  }

  if (amountsAre === "Tax Inclusive") {
    return getEnteredAmount(item);
  }

  return getBaseAmount(item, amountsAre) + getTaxAmount(item, amountsAre);
}

export function InvoiceItemsTable({
  items,
  amountsAre,
  readOnly = false,
  synced,
  subtotal,
  taxTotal,
  totalAmount,
  itemCatalog,
  itemCatalogSyncState,
  itemCatalogFeedback,
  itemCatalogLastUpdated,
  pendingFocusRowId,
  onAddItem,
  onChangeItem,
  onDeleteItem,
  onRefreshItemCatalog,
  onPendingFocusHandled,
}: Props) {
  const { isCashPaymentSelected } = useInvoiceDisplay();
  const [showUnsyncedNotice, setShowUnsyncedNotice] = useState(!synced);
  const [showCatalogNotice, setShowCatalogNotice] = useState(itemCatalogSyncState === "syncing" || Boolean(itemCatalogFeedback));
  const descriptionRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  useEffect(() => {
    for (const item of items) {
      const target = descriptionRefs.current[item.id];
      if (!target) continue;
      target.style.height = "0px";
      target.style.height = `${target.scrollHeight}px`;
    }
  }, [items]);

  useEffect(() => {
    if (!synced) {
      setShowUnsyncedNotice(true);
      const timer = window.setTimeout(() => setShowUnsyncedNotice(false), 5000);
      return () => window.clearTimeout(timer);
    }
    setShowUnsyncedNotice(false);
  }, [synced]);

  useEffect(() => {
    if (itemCatalogSyncState === "syncing") {
      setShowCatalogNotice(true);
      return;
    }
    if (itemCatalogFeedback) {
      setShowCatalogNotice(true);
      const timer = window.setTimeout(() => setShowCatalogNotice(false), 5000);
      return () => window.clearTimeout(timer);
    }
    setShowCatalogNotice(false);
  }, [itemCatalogSyncState, itemCatalogFeedback]);

  useEffect(() => {
    if (!pendingFocusRowId) return;
    const target = descriptionRefs.current[pendingFocusRowId];
    if (!target) return;
    target.focus();
    target.select();
    onPendingFocusHandled();
  }, [pendingFocusRowId, items, onPendingFocusHandled]);

  const itemSyncTone =
    itemCatalogSyncState === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : itemCatalogSyncState === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : itemCatalogSyncState === "syncing"
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-[var(--ds-border)] bg-[rgba(0,0,0,0.02)] text-[var(--ds-muted)]";

  const itemOptions = useMemo(() => itemCatalog.map((item) => `${item.code} - ${item.name}`), [itemCatalog]);
  const effectiveTaxTotal = isCashPaymentSelected ? 0 : taxTotal;
  const effectiveTotalAmount = isCashPaymentSelected ? subtotal : totalAmount;

  return (
    <div className="mt-8">
      {/* <div className="flex flex-col items-start gap-3">
        <div>
          <div className="text-xl font-semibold text-[var(--ds-text)]">Invoice Items</div>
          <div className="mt-1 text-sm text-[var(--ds-muted)]">Aligned to the Xero line item structure.</div>
        </div>
      </div> */}

      {showUnsyncedNotice ? (
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          <AlertCircle className="h-4 w-4" />
          Invoice items have local edits and need sync.
        </div>
      ) : null}

      {showCatalogNotice ? (
        <div className={["mt-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm", itemSyncTone].join(" ")}>
          <div className="flex items-center gap-2">
            {itemCatalogSyncState === "syncing" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : itemCatalogSyncState === "success" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            <span>{itemCatalogFeedback}</span>
          </div>
          <div className="shrink-0 text-xs">
            {itemCatalogLastUpdated ? `Last updated: ${itemCatalogLastUpdated}` : "Not refreshed yet"}
          </div>
        </div>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-[16px] border border-[var(--ds-border)] bg-white">
        <table className="w-full border-collapse table-fixed">
          <thead>
            <tr className="border-b border-[var(--ds-border)] bg-[rgba(0,0,0,0.04)] text-left text-sm font-semibold text-[var(--ds-text)]">
              <th className="w-8 px-2 py-3"></th>
              <th className="w-[12%] px-2 py-3">
                <div className="flex items-center gap-1.5">
                  <span>Item</span>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--ds-muted)] transition hover:bg-[rgba(0,0,0,0.06)] hover:text-[var(--ds-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                    title="Refresh item list from Xero"
                    onClick={onRefreshItemCatalog}
                    disabled={readOnly || itemCatalogSyncState === "syncing"}
                  >
                    {itemCatalogSyncState === "syncing" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCcw className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </th>
              <th className="w-[26%] px-2 py-2">Description</th>
              <th className="w-[8%] px-2 py-2">Qty.</th>
              <th className="w-[10%] px-2 py-2">Price</th>
              <th className="w-[8%] px-2 py-2">Disc.</th>
              <th className="w-[12%] px-2 py-2">Account</th>
              <th className="w-[10%] px-2 py-2">Tax rate</th>
              <th className="w-[9%] px-2 py-2">Tax amount</th>
              <th className="w-[11%] px-2 py-2">Amount NZD</th>
              <th className="w-10 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const taxAmount = isCashPaymentSelected ? 0 : getTaxAmount(item, amountsAre);
              const lineAmount = getLineAmount(item, amountsAre);
              return (
                <tr key={item.id} className="border-b border-[var(--ds-border)] last:border-b-0">
                  <td className="px-2 py-2 text-[var(--ds-muted)] align-top">
                    <GripVertical className="h-4 w-4" />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <Input
                      list={`invoice-item-options-${item.id}`}
                      value={item.itemCode}
                      onChange={(e) => onChangeItem(item.id, "itemCode", e.target.value)}
                      placeholder="Type code or name"
                      className="h-8 rounded-[6px] border-0 px-1 shadow-none focus:ring-0"
                      disabled={readOnly}
                    />
                    <datalist id={`invoice-item-options-${item.id}`}>
                      {itemOptions.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <textarea
                      ref={(node) => {
                        descriptionRefs.current[item.id] = node;
                      }}
                      value={item.description}
                      onChange={(e) => onChangeItem(item.id, "description", e.target.value)}
                      className="w-full resize-none overflow-hidden rounded-[6px] border-0 bg-white px-1 py-1 text-sm leading-5 text-[var(--ds-text)] outline-none"
                      disabled={readOnly}
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={item.quantity}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => onChangeItem(item.id, "quantity", e.target.value)}
                      className="h-8 rounded-[6px] border-0 px-1 shadow-none focus:ring-0"
                      disabled={readOnly}
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.unitPrice}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => onChangeItem(item.id, "unitPrice", e.target.value)}
                      className="h-8 rounded-[6px] border-0 px-1 shadow-none focus:ring-0"
                      disabled={readOnly}
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.discount}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => onChangeItem(item.id, "discount", e.target.value)}
                      className="h-8 rounded-[6px] border-0 px-1 shadow-none focus:ring-0"
                      disabled={readOnly}
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <Input value={item.account} onChange={(e) => onChangeItem(item.id, "account", e.target.value)} className="h-8 rounded-[6px] border-0 px-1 shadow-none focus:ring-0" disabled={readOnly} />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <Select
                      value={item.taxRate}
                      onChange={(e) => onChangeItem(item.id, "taxRate", e.target.value)}
                      className="h-8 rounded-[6px] border-0 px-1 shadow-none focus:ring-0"
                      disabled={readOnly}
                    >
                      {TAX_RATE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-2 py-2 text-sm font-medium text-[var(--ds-text)] align-top">${taxAmount.toFixed(2)}</td>
                  <td className="px-2 py-2 text-sm font-semibold text-[var(--ds-text)] align-top">${lineAmount.toFixed(2)}</td>
                  <td className="px-2 py-2 text-right align-top">
                    <button
                      type="button"
                      className="rounded-lg p-2 text-[var(--ds-muted)] hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--ds-muted)]"
                      onClick={() => onDeleteItem(item.id)}
                      disabled={readOnly}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <Button
          className="h-11 self-start border-[var(--ds-primary)] bg-white px-5 text-[var(--ds-primary)] hover:bg-red-50"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={onAddItem}
          disabled={readOnly}
        >
          Add item
        </Button>
        <div className="w-full max-w-[420px] space-y-4 text-right">
          <div className="flex items-center justify-between text-[15px] text-[var(--ds-text)]">
            <span>Subtotal</span>
            <span>{subtotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-[15px] text-[var(--ds-text)]">
            <span>Total GST</span>
            <span>{effectiveTaxTotal.toFixed(2)}</span>
          </div>
          <div className="border-t-4 border-[rgba(0,0,0,0.18)] pt-4">
            <div className="flex items-center justify-between text-2xl font-semibold text-[var(--ds-text)]">
              <span>Total</span>
              <span>{effectiveTotalAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
