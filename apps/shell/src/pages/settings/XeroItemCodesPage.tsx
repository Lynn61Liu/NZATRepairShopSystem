import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, EmptyState, Input, Pagination, useToast } from "@/components/ui";
import { XeroButton } from "@/components/common/XeroButton";
import { refreshInventoryItemsCache } from "@/features/lookups/lookupCache";
import { requestJson } from "@/utils/api";
import { paginate } from "@/utils/pagination";
import { RefreshCcw } from "lucide-react";

type InventoryItemRow = {
  id: string;
  itemCode: string;
  itemName: string;
  quantity: string;
  purchasesDescription: string;
  purchasesUnitPrice: string;
  purchasesAccount: string;
  purchasesTaxRate: string;
  salesDescription: string;
  salesUnitPrice: string;
  salesAccount: string;
  salesTaxRate: string;
  inventoryAssetAccount: string;
  costOfGoodsSoldAccount: string;
  status: string;
  inventoryType: string;
};

type InventoryItemResponse = {
  id: number;
  itemCode: string;
  itemName: string;
  quantity: number | null;
  purchasesDescription: string | null;
  purchasesUnitPrice: number | null;
  purchasesAccount: string | null;
  purchasesTaxRate: string | null;
  salesDescription: string | null;
  salesUnitPrice: number | null;
  salesAccount: string | null;
  salesTaxRate: string | null;
  inventoryAssetAccount: string | null;
  costOfGoodsSoldAccount: string | null;
  status: string;
  inventoryType: string | null;
};

const columns: Array<{ key: keyof InventoryItemRow; label: string; width: string; multiline?: boolean }> = [
  { key: "itemCode", label: "Item Code", width: "w-[210px]" },
  { key: "itemName", label: "Item Name", width: "w-[352px]" },
  { key: "quantity", label: "Quantity", width: "w-[110px]" },
  { key: "salesDescription", label: "Sales Description", width: "w-[240px]", multiline: true },
  { key: "salesUnitPrice", label: "Sales Unit Price", width: "w-[140px]" },
  { key: "salesAccount", label: "Sales Account", width: "w-[140px]" },
  { key: "salesTaxRate", label: "Sales Tax Rate", width: "w-[140px]" },
  { key: "purchasesDescription", label: "Purchases Description", width: "w-[240px]", multiline: true },
  { key: "purchasesUnitPrice", label: "Purchases Unit Price", width: "w-[150px]" },
  { key: "purchasesAccount", label: "Purchases Account", width: "w-[150px]" },
  { key: "purchasesTaxRate", label: "Purchases Tax Rate", width: "w-[150px]" },
  { key: "inventoryAssetAccount", label: "Inventory Asset Account", width: "w-[180px]" },
  { key: "costOfGoodsSoldAccount", label: "COGS Account", width: "w-[160px]" },
  { key: "status", label: "Status", width: "w-[120px]" },
  { key: "inventoryType", label: "Inventory Type", width: "w-[140px]" },
];

const alwaysVisibleColumns: Array<keyof InventoryItemRow> = ["itemCode", "itemName"];

function mapRow(item: InventoryItemResponse): InventoryItemRow {
  return {
    id: String(item.id),
    itemCode: item.itemCode ?? "",
    itemName: item.itemName ?? "",
    quantity: item.quantity == null ? "" : String(item.quantity),
    purchasesDescription: item.purchasesDescription ?? "",
    purchasesUnitPrice: item.purchasesUnitPrice == null ? "" : String(item.purchasesUnitPrice),
    purchasesAccount: item.purchasesAccount ?? "",
    purchasesTaxRate: item.purchasesTaxRate ?? "",
    salesDescription: item.salesDescription ?? "",
    salesUnitPrice: item.salesUnitPrice == null ? "" : String(item.salesUnitPrice),
    salesAccount: item.salesAccount ?? "",
    salesTaxRate: item.salesTaxRate ?? "",
    inventoryAssetAccount: item.inventoryAssetAccount ?? "",
    costOfGoodsSoldAccount: item.costOfGoodsSoldAccount ?? "",
    status: item.status ?? "",
    inventoryType: item.inventoryType ?? "",
  };
}

export function XeroItemCodesPage() {
  const toast = useToast();
  const pageSize = 18;
  const [rows, setRows] = useState<InventoryItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [purchasesOnly, setPurchasesOnly] = useState(false);
  const [salesOnly, setSalesOnly] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [syncingXero, setSyncingXero] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>("");

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (keyword) {
        const matchesKeyword = Object.values(row)
          .join(" ")
          .toLowerCase()
          .includes(keyword);
        if (!matchesKeyword) return false;
      }

      const hasPurchasesData = [
        row.purchasesDescription,
        row.purchasesUnitPrice,
        row.purchasesAccount,
        row.purchasesTaxRate,
      ].some((value) => value.trim() !== "");

      const hasSalesData = [
        row.salesDescription,
        row.salesUnitPrice,
        row.salesAccount,
        row.salesTaxRate,
      ].some((value) => value.trim() !== "");

      if (purchasesOnly && !hasPurchasesData) return false;
      if (salesOnly && !hasSalesData) return false;

      return true;
    });
  }, [rows, search, purchasesOnly, salesOnly]);

  const visibleColumns = useMemo(() => {
    return columns.filter((column) => {
      if (alwaysVisibleColumns.includes(column.key)) return true;
      return rows.some((row) => {
        const value = row[column.key];
        return typeof value === "string" ? value.trim() !== "" && value.trim() !== "-" : Boolean(value);
      });
    });
  }, [rows]);

  const pagination = useMemo(() => paginate(filteredRows, currentPage, pageSize), [filteredRows, currentPage]);
  const safePage = pagination.currentPage;

  const loadRows = async () => {
    setLoading(true);
    setLoadError(null);
    const query = search.trim() ? `?query=${encodeURIComponent(search.trim())}` : "";
    const res = await requestJson<InventoryItemResponse[]>(`/api/inventory-items/manage${query}`);
    if (!res.ok || !Array.isArray(res.data)) {
      const message = res.error || "Failed to load Xero item codes.";
      setRows([]);
      setLoadError(message);
      setLoading(false);
      return;
    }

    setRows(res.data.map(mapRow));
    setLoading(false);
  };

  const loadSyncStatus = async () => {
    const res = await requestJson<{
      lastSyncedAt?: string | null;
      lastError?: string | null;
    }>("/api/inventory-items/manage/sync-status");

    if (!res.ok || !res.data) return;

    if (res.data.lastSyncedAt) {
      setLastSyncedAt(new Date(res.data.lastSyncedAt).toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-"));
    }
    if (res.data.lastError) {
      setActionError((prev) => prev || res.data?.lastError || null);
    }
  };

  useEffect(() => {
    void loadRows();
  }, [search]);

  useEffect(() => {
    void loadSyncStatus();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, purchasesOnly, salesOnly]);

  useEffect(() => {
    if (safePage !== currentPage) {
      setCurrentPage(safePage);
    }
  }, [safePage, currentPage]);

  const syncFromXero = async () => {
    setSyncingXero(true);
    setActionError(null);
    const res = await requestJson<{ success: boolean; syncedCount: number; syncedAtUtc: string }>(
      "/api/inventory-items/manage/sync-xero",
      {
        method: "POST",
      }
    );
    setSyncingXero(false);

    if (!res.ok || !res.data) {
      const message = res.error || "Failed to sync Xero item codes.";
      setActionError(message);
      toast.error(message);
      return;
    }

    setLastSyncedAt(new Date(res.data.syncedAtUtc).toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-"));
    await refreshInventoryItemsCache();
    await loadSyncStatus();
    await loadRows();
    toast.success(`Synced ${res.data.syncedCount} item(s) from Xero`);
  };

  const openInXero = () => {
    window.open("https://go.xero.com/app/!!0zc-/products-and-services", "_blank", "noopener,noreferrer");
  };

  const Toggle = ({
    checked,
    label,
    onChange,
  }: {
    checked: boolean;
    label: string;
    onChange: (next: boolean) => void;
  }) => (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={[
        "inline-flex min-w-[148px] items-center justify-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition",
        checked
          ? "border-[rgba(37,99,235,0.35)] bg-[rgba(37,99,235,0.08)] text-[rgba(37,99,235,0.95)]"
          : "border-[rgba(0,0,0,0.08)] bg-white text-[rgba(0,0,0,0.6)] hover:border-[rgba(0,0,0,0.16)]",
      ].join(" ")}
      aria-pressed={checked}
    >
      <span
        className={[
          "relative inline-flex h-5 w-9 items-center rounded-full transition",
          checked ? "bg-[rgba(37,99,235,0.8)]" : "bg-[rgba(0,0,0,0.16)]",
        ].join(" ")}
      >
        <span
          className={[
            "inline-block h-4 w-4 rounded-full bg-white shadow transition",
            checked ? "translate-x-4" : "translate-x-0.5",
          ].join(" ")}
        />
      </span>
      <span>{label}</span>
    </button>
  );

  return (
    <div className="space-y-4 text-[14px]">
      <h1 className="text-2xl font-semibold text-[rgba(0,0,0,0.72)]">Xero Item Code</h1>

      {loadError ? <Alert variant="error" description={loadError} onClose={() => setLoadError(null)} /> : null}
      {actionError ? <Alert variant="error" description={actionError} onClose={() => setActionError(null)} /> : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-[rgba(0,0,0,0.7)]">Inventory Item Codes</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--ds-muted)]">
              <span>{lastSyncedAt ? `Last updated: ${lastSyncedAt}` : "Last updated: not synced yet"}</span>
              <Button
                onClick={syncFromXero}
                disabled={syncingXero}
                className="h-8 px-3 text-xs"
                leftIcon={<RefreshCcw className={`h-3.5 w-3.5 ${syncingXero ? "animate-spin" : ""}`} />}
              >
                {syncingXero ? "Syncing..." : "Sync Xero"}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Toggle checked={purchasesOnly} label="Has Purchases data" onChange={setPurchasesOnly} />
            <Toggle checked={salesOnly} label="Has sales data" onChange={setSalesOnly} />
            <Input
              className="w-[260px]"
              placeholder="Search code, name, account, description..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <XeroButton className="h-9 px-4 text-[11px]" label="Open" title="Open Xero Products & Services" onClick={openInXero} />
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-[var(--ds-muted)]">Loading...</div>
        ) : pagination.totalItems === 0 ? (
          <EmptyState message="No Xero item codes yet" />
        ) : (
          <>
          <div className="overflow-x-auto">
            <div className="min-w-[2440px]">
              <div className="flex border-b border-[rgba(0,0,0,0.06)] bg-[rgba(0,0,0,0.02)] px-4 py-3 text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">
                {visibleColumns.map((column) => (
                  <div key={column.key} className={`${column.width} shrink-0 px-1`}>
                    {column.label}
                  </div>
                ))}
                <div className="w-[140px] shrink-0 px-1 text-right">Actions</div>
              </div>

              {pagination.pageRows.map((row) => {
                return (
                  <div key={row.id} className="flex border-b border-[rgba(0,0,0,0.05)] px-4 py-3 hover:bg-[rgba(0,0,0,0.015)]">
                    {visibleColumns.map((column) => (
                      <div key={column.key} className={`${column.width} shrink-0 px-1`}>
                        <div className={column.multiline ? "whitespace-pre-wrap text-xs leading-5 text-[var(--ds-text)]" : "text-xs text-[var(--ds-text)]"}>
                          {row[column.key] || "-"}
                        </div>
                      </div>
                    ))}

                    <div className="flex w-[140px] shrink-0 items-start justify-end px-1">
                      <span className="text-xs text-[rgba(0,0,0,0.42)]">Sync only</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <Pagination
            currentPage={safePage}
            totalPages={pagination.totalPages}
            pageSize={pageSize}
            totalItems={pagination.totalItems}
            onPageChange={setCurrentPage}
          />
          </>
        )}
      </Card>
    </div>
  );
}
