import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, EmptyState, Input, Textarea, useToast } from "@/components/ui";
import { requestJson } from "@/utils/api";
import { Pencil, Plus, RefreshCcw } from "lucide-react";

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

const blankDraft: InventoryItemRow = {
  id: "",
  itemCode: "",
  itemName: "",
  quantity: "",
  purchasesDescription: "",
  purchasesUnitPrice: "",
  purchasesAccount: "",
  purchasesTaxRate: "",
  salesDescription: "",
  salesUnitPrice: "",
  salesAccount: "",
  salesTaxRate: "",
  inventoryAssetAccount: "",
  costOfGoodsSoldAccount: "",
  status: "ACTIVE",
  inventoryType: "",
};

const columns: Array<{ key: keyof InventoryItemRow; label: string; width: string; multiline?: boolean }> = [
  { key: "itemCode", label: "Item Code", width: "w-[140px]" },
  { key: "itemName", label: "Item Name", width: "w-[220px]" },
  { key: "quantity", label: "Quantity", width: "w-[110px]" },
  { key: "purchasesDescription", label: "Purchases Description", width: "w-[240px]", multiline: true },
  { key: "purchasesUnitPrice", label: "Purchases Unit Price", width: "w-[150px]" },
  { key: "purchasesAccount", label: "Purchases Account", width: "w-[150px]" },
  { key: "purchasesTaxRate", label: "Purchases Tax Rate", width: "w-[150px]" },
  { key: "salesDescription", label: "Sales Description", width: "w-[240px]", multiline: true },
  { key: "salesUnitPrice", label: "Sales Unit Price", width: "w-[140px]" },
  { key: "salesAccount", label: "Sales Account", width: "w-[140px]" },
  { key: "salesTaxRate", label: "Sales Tax Rate", width: "w-[140px]" },
  { key: "inventoryAssetAccount", label: "Inventory Asset Account", width: "w-[180px]" },
  { key: "costOfGoodsSoldAccount", label: "COGS Account", width: "w-[160px]" },
  { key: "status", label: "Status", width: "w-[120px]" },
  { key: "inventoryType", label: "Inventory Type", width: "w-[140px]" },
];

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

function toPayload(row: InventoryItemRow) {
  const toNullableNumber = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const toNullableString = (value: string) => {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };

  return {
    itemCode: row.itemCode.trim(),
    itemName: row.itemName.trim(),
    quantity: toNullableNumber(row.quantity),
    purchasesDescription: toNullableString(row.purchasesDescription),
    purchasesUnitPrice: toNullableNumber(row.purchasesUnitPrice),
    purchasesAccount: toNullableString(row.purchasesAccount),
    purchasesTaxRate: toNullableString(row.purchasesTaxRate),
    salesDescription: toNullableString(row.salesDescription),
    salesUnitPrice: toNullableNumber(row.salesUnitPrice),
    salesAccount: toNullableString(row.salesAccount),
    salesTaxRate: toNullableString(row.salesTaxRate),
    inventoryAssetAccount: toNullableString(row.inventoryAssetAccount),
    costOfGoodsSoldAccount: toNullableString(row.costOfGoodsSoldAccount),
    status: row.status.trim(),
    inventoryType: toNullableString(row.inventoryType),
  };
}

export function XeroItemCodesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<InventoryItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [purchasesOnly, setPurchasesOnly] = useState(false);
  const [salesOnly, setSalesOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<InventoryItemRow>(blankDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<InventoryItemRow>(blankDraft);
  const [saving, setSaving] = useState(false);
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

  const startAdd = () => {
    setAdding(true);
    setEditingId(null);
    setDraft(blankDraft);
    setActionError(null);
  };

  const startEdit = (row: InventoryItemRow) => {
    setEditingId(row.id);
    setAdding(false);
    setEditDraft({ ...row });
    setActionError(null);
  };

  const cancelAdd = () => {
    setAdding(false);
    setDraft(blankDraft);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(blankDraft);
  };

  const saveNew = async () => {
    setSaving(true);
    setActionError(null);
    const res = await requestJson<InventoryItemResponse>("/api/inventory-items/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(draft)),
    });
    setSaving(false);

    if (!res.ok) {
      const message = res.error || "Failed to create item.";
      setActionError(message);
      toast.error(message);
      return;
    }

    setAdding(false);
    setDraft(blankDraft);
    await loadRows();
    toast.success("Xero item code created");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    setActionError(null);
    const res = await requestJson<InventoryItemResponse>(`/api/inventory-items/manage/${editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(editDraft)),
    });
    setSaving(false);

    if (!res.ok) {
      const message = res.error || "Failed to update item.";
      setActionError(message);
      toast.error(message);
      return;
    }

    setEditingId(null);
    setEditDraft(blankDraft);
    await loadRows();
    toast.success("Xero item code updated");
  };

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
    await loadSyncStatus();
    await loadRows();
    toast.success(`Synced ${res.data.syncedCount} item(s) from Xero`);
  };

  const renderCellInput = (
    row: InventoryItemRow,
    setRow: React.Dispatch<React.SetStateAction<InventoryItemRow>>,
    key: keyof InventoryItemRow,
    multiline?: boolean
  ) => {
    const value = row[key];
    if (multiline) {
      return (
        <Textarea
          value={value}
          rows={2}
          className="min-h-[64px] text-xs"
          onChange={(event) => setRow((prev) => ({ ...prev, [key]: event.target.value }))}
        />
      );
    }

    return (
      <Input
        value={value}
        className="h-9 text-xs"
        onChange={(event) => setRow((prev) => ({ ...prev, [key]: event.target.value }))}
      />
    );
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
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition",
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
            <Toggle checked={purchasesOnly} label="Purchases only" onChange={setPurchasesOnly} />
            <Toggle checked={salesOnly} label="Sales only" onChange={setSalesOnly} />
            <Input
              className="w-[260px]"
              placeholder="Search code, name, account, description..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button variant="primary" leftIcon={<Plus size={16} />} onClick={startAdd}>
              Add
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-[var(--ds-muted)]">Loading...</div>
        ) : filteredRows.length === 0 && !adding ? (
          <EmptyState message="No Xero item codes yet" />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[2440px]">
              <div className="flex border-b border-[rgba(0,0,0,0.06)] bg-[rgba(0,0,0,0.02)] px-4 py-3 text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">
                {columns.map((column) => (
                  <div key={column.key} className={`${column.width} shrink-0 px-1`}>
                    {column.label}
                  </div>
                ))}
                <div className="w-[140px] shrink-0 px-1 text-right">Actions</div>
              </div>

              {adding ? (
                <div className="flex border-b border-[rgba(0,0,0,0.05)] px-4 py-3 align-top">
                  {columns.map((column) => (
                    <div key={column.key} className={`${column.width} shrink-0 px-1`}>
                      {renderCellInput(draft, setDraft, column.key, column.multiline)}
                    </div>
                  ))}
                  <div className="flex w-[140px] shrink-0 items-start justify-end gap-2 px-1">
                    <Button variant="primary" onClick={saveNew} disabled={saving}>
                      Save
                    </Button>
                    <Button onClick={cancelAdd} disabled={saving}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}

              {filteredRows.map((row) => {
                const isEditing = editingId === row.id;
                const current = isEditing ? editDraft : row;
                return (
                  <div key={row.id} className="flex border-b border-[rgba(0,0,0,0.05)] px-4 py-3 hover:bg-[rgba(0,0,0,0.015)]">
                    {columns.map((column) => (
                      <div key={column.key} className={`${column.width} shrink-0 px-1`}>
                        {isEditing ? (
                          renderCellInput(current, setEditDraft, column.key, column.multiline)
                        ) : (
                          <div className={column.multiline ? "whitespace-pre-wrap text-xs leading-5 text-[var(--ds-text)]" : "text-xs text-[var(--ds-text)]"}>
                            {current[column.key] || "-"}
                          </div>
                        )}
                      </div>
                    ))}

                    <div className="flex w-[140px] shrink-0 items-start justify-end gap-2 px-1">
                      {isEditing ? (
                        <>
                          <Button variant="primary" onClick={saveEdit} disabled={saving}>
                            Save
                          </Button>
                          <Button onClick={cancelEdit} disabled={saving}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <button
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[rgba(0,0,0,0.5)] transition hover:bg-[rgba(0,0,0,0.06)] hover:text-[rgba(0,0,0,0.78)]"
                          onClick={() => startEdit(row)}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
