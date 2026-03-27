import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Alert, Button, Card, EmptyState, Input, Pagination, useToast } from "@/components/ui";
import {
  setCachedInventoryItems,
  setCachedServiceCatalog,
} from "@/features/lookups/lookupCache";
import { requestJson } from "@/utils/api";
import { paginate } from "@/utils/pagination";
import { Pencil, Plus, Trash2 } from "lucide-react";

type ServiceCatalogRow = {
  id: string;
  serviceType: "wof" | "mech" | "paint";
  category: "root" | "child";
  name: string;
  personalLinkCode: string;
  dealershipLinkCode: string;
  isActive: boolean;
  sortOrder: number;
};

type ServiceCatalogResponse = {
  id: number | string;
  serviceType: "wof" | "mech" | "paint";
  category: "root" | "child";
  name: string;
  personalLinkCode?: string | null;
  dealershipLinkCode?: string | null;
  isActive: boolean;
  sortOrder: number;
};

type DraftRow = {
  serviceType: "wof" | "mech" | "paint";
  name: string;
  personalLinkCode: string;
  dealershipLinkCode: string;
  isActive: boolean;
  sortOrder: string;
};

const blankDraft: DraftRow = {
  serviceType: "wof",
  name: "",
  personalLinkCode: "",
  dealershipLinkCode: "",
  isActive: true,
  sortOrder: "0",
};

type InventoryItemOption = {
  id: string;
  itemCode: string;
  itemName: string;
  salesUnitPrice: number | null;
  status: string;
};

function mapRow(item: ServiceCatalogResponse): ServiceCatalogRow {
  return {
    id: String(item.id),
    serviceType: item.serviceType,
    category: item.category,
    name: item.name,
    personalLinkCode: item.personalLinkCode ?? "",
    dealershipLinkCode: item.dealershipLinkCode ?? "",
    isActive: item.isActive,
    sortOrder: item.sortOrder ?? 0,
  };
}

function serviceTypeLabel(value: string) {
  return value === "wof" ? "WOF" : value === "mech" ? "机修" : "喷漆";
}

function formatSalesPrice(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "-";
  return `$${value.toFixed(2)}`;
}

function InventoryItemValue({
  code,
  matchedItem,
}: {
  code: string;
  matchedItem?: InventoryItemOption | null;
}) {
  if (!code) {
    return <div className="truncate text-[rgba(0,0,0,0.4)]">-</div>;
  }

  if (!matchedItem) {
    return <div className="truncate text-[rgba(0,0,0,0.72)]">{code}</div>;
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="shrink-0 rounded-[8px] border border-[rgba(0,0,0,0.85)] px-2 py-0.5 text-[9px] font-semibold tracking-[0.02em] text-[rgba(0,0,0,0.92)]">
        {matchedItem.itemCode}
      </div>
      <div className="min-w-0 truncate text-[13px] font-medium text-[rgba(0,0,0,0.78)]">{matchedItem.itemName}</div>
      <div className="shrink-0 text-[11px] font-medium text-[rgba(0,0,0,0.78)]">Sales price: {formatSalesPrice(matchedItem.salesUnitPrice)}</div>
    </div>
  );
}

function InventoryLinkCodeInput({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  options: InventoryItemOption[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 520,
  });
  const blurTimer = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const query = value.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    const base = options.filter(
      (item) => item.status.toUpperCase() !== "DELETED" && item.salesUnitPrice != null
    );
    if (!query) return base;
    return base.filter((item) =>
      [item.itemCode, item.itemName]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [options, query]);

  useEffect(() => {
    setActiveIndex(filteredOptions.length > 0 ? 0 : -1);
  }, [filteredOptions.length]);

  const commitSelection = (itemCode: string) => {
    onChange(itemCode);
    setOpen(false);
    setActiveIndex(-1);
  };

  const updateDropdownDirection = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const dropdownWidth = Math.min(520, viewportWidth - 48);
    const estimatedDropdownHeight = Math.min(320, Math.max(160, filteredOptions.length * 56)) + 12;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const nextOpenUpward = spaceBelow < estimatedDropdownHeight && spaceAbove > spaceBelow;
    const preferRightAligned = rect.right + dropdownWidth > viewportWidth - 24;
    const left = preferRightAligned
      ? Math.max(24, rect.right - dropdownWidth)
      : Math.max(24, Math.min(rect.left, viewportWidth - dropdownWidth - 24));
    const top = nextOpenUpward
      ? Math.max(16, rect.top - estimatedDropdownHeight - 8)
      : Math.min(rect.bottom + 8, viewportHeight - estimatedDropdownHeight - 16);

    setDropdownStyle({ top, left, width: dropdownWidth });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open || filteredOptions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % filteredOptions.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? filteredOptions.length - 1 : prev - 1));
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0 && filteredOptions[activeIndex]) {
      event.preventDefault();
      commitSelection(filteredOptions[activeIndex].itemCode);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => {
          updateDropdownDirection();
          setOpen(true);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          updateDropdownDirection();
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 120);
        }}
      />
      {open
        ? createPortal(
        <div
          className="rounded-[10px] border border-[rgba(0,0,0,0.12)] bg-white shadow-lg"
          style={{
            position: "fixed",
            top: dropdownStyle.top,
            left: dropdownStyle.left,
            width: dropdownStyle.width,
            zIndex: 9999,
          }}
        >
          {filteredOptions.length > 0 ? (
            <ul className="max-h-[320px] overflow-auto py-1">
              {filteredOptions.map((item, index) => {
                const active = index === activeIndex;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => commitSelection(item.itemCode)}
                    className={[
                        "w-full px-3 py-2 text-left transition",
                        active ? "bg-[rgba(37,99,235,0.08)]" : "hover:bg-[rgba(0,0,0,0.04)]",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-3">
                        <div className="shrink-0 rounded-[8px] border border-[rgba(0,0,0,0.88)] px-2 py-0.5 text-[11px] font-semibold tracking-[0.02em] text-[rgba(0,0,0,0.96)]">
                          {item.itemCode}
                        </div>
                        <div
                          className="min-w-0 flex-1 whitespace-normal break-words text-[13px] font-medium leading-5 text-[rgba(0,0,0,0.82)]"
                          title={item.itemName}
                        >
                          {item.itemName}
                        </div>
                        <div className="shrink-0 text-[11px] text-[rgba(0,0,0,0.64)]">Sales price: {formatSalesPrice(item.salesUnitPrice)}</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-3 py-3 text-sm text-[rgba(0,0,0,0.45)]">没有匹配的 Inventory Item</div>
          )}
        </div>,
        document.body
      )
        : null}
    </div>
  );
}

export function ServiceCatalogPage() {
  const toast = useToast();
  const [rows, setRows] = useState<ServiceCatalogRow[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftRow>(blankDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ServiceCatalogRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [childFilter, setChildFilter] = useState<"wof" | "mech" | "paint">("wof");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const inventoryItemMap = useMemo(
    () => new Map(inventoryItems.map((item) => [item.itemCode, item])),
    [inventoryItems]
  );

  const childRows = useMemo(
    () =>
      rows
        .filter((item) => item.category === "child" && item.serviceType === childFilter)
        .filter((item) => {
          const keyword = search.trim().toLowerCase();
          if (!keyword) return true;
          return [item.name, item.personalLinkCode, item.dealershipLinkCode, serviceTypeLabel(item.serviceType)].join(" ").toLowerCase().includes(keyword);
        })
        .sort((a, b) => a.sortOrder - b.sortOrder || Number(a.id) - Number(b.id)),
    [rows, childFilter, search]
  );

  const pagination = useMemo(() => paginate(childRows, currentPage, pageSize), [childRows, currentPage, pageSize]);
  const safePage = pagination.currentPage;

  const loadInventoryItems = async () => {
    const res = await requestJson<
      Array<{
        id: number;
        itemCode: string;
        itemName: string;
        salesUnitPrice?: number | null;
        status: string;
      }>
    >("/api/inventory-items/manage");

    if (!res.ok || !Array.isArray(res.data)) {
      return;
    }

    setInventoryItems(
      res.data.map((item) => ({
        id: String(item.id),
        itemCode: item.itemCode ?? "",
        itemName: item.itemName ?? "",
        salesUnitPrice: typeof item.salesUnitPrice === "number" ? item.salesUnitPrice : null,
        status: item.status ?? "",
      }))
    );
    setCachedInventoryItems(
      res.data.map((item) => ({
        id: String(item.id),
        itemCode: item.itemCode ?? "",
        itemName: item.itemName ?? "",
        salesUnitPrice: typeof item.salesUnitPrice === "number" ? item.salesUnitPrice : null,
        status: item.status ?? "",
      }))
    );
  };

  const loadRows = async () => {
    setLoading(true);
    setLoadError(null);
    const res = await requestJson<{
      rootServices?: ServiceCatalogResponse[];
      childServices?: ServiceCatalogResponse[];
    }>("/api/service-catalog/manage");

    if (!res.ok || !res.data) {
      setRows([]);
      setLoadError(res.error || "Failed to load service catalog.");
      setLoading(false);
      return;
    }

    const root = Array.isArray(res.data.rootServices) ? res.data.rootServices : [];
    const child = Array.isArray(res.data.childServices) ? res.data.childServices : [];
    setCachedServiceCatalog({
      rootServices: root.map((item) => ({
        id: item.id,
        serviceType: item.serviceType,
        category: item.category,
        name: item.name,
        personalLinkCode: item.personalLinkCode ?? null,
        dealershipLinkCode: item.dealershipLinkCode ?? null,
        isActive: item.isActive,
        sortOrder: item.sortOrder ?? 0,
      })),
      childServices: child.map((item) => ({
        id: item.id,
        serviceType: item.serviceType,
        category: item.category,
        name: item.name,
        personalLinkCode: item.personalLinkCode ?? null,
        dealershipLinkCode: item.dealershipLinkCode ?? null,
        isActive: item.isActive,
        sortOrder: item.sortOrder ?? 0,
      })),
    });
    setRows([...root, ...child].map(mapRow));
    setLoading(false);
  };

  useEffect(() => {
    void loadRows();
  }, []);

  useEffect(() => {
    void loadInventoryItems();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [childFilter, search]);

  useEffect(() => {
    if (safePage !== currentPage) {
      setCurrentPage(safePage);
    }
  }, [safePage, currentPage]);

  const startAdd = () => {
    setActionError(null);
    setAdding(true);
    setEditingId(null);
    setDraft({ ...blankDraft, serviceType: childFilter });
  };

  const cancelAdd = () => {
    setAdding(false);
    setDraft({ ...blankDraft, serviceType: childFilter });
  };

  const startEdit = (row: ServiceCatalogRow) => {
    setActionError(null);
    setEditingId(row.id);
    setEditDraft({ ...row });
    setAdding(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const saveNewChild = async () => {
    setSaving(true);
    setActionError(null);
    const res = await requestJson<ServiceCatalogResponse>("/api/service-catalog/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceType: draft.serviceType,
        category: "child",
        name: draft.name,
        personalLinkCode: draft.personalLinkCode,
        dealershipLinkCode: draft.dealershipLinkCode,
        isActive: draft.isActive,
        sortOrder: Number(draft.sortOrder) || 0,
      }),
    });
    setSaving(false);

    if (!res.ok || !res.data) {
      setActionError(res.error || "Failed to create child service.");
      return;
    }

    await Promise.all([loadRows(), loadInventoryItems()]);
    setAdding(false);
    setDraft({ ...blankDraft, serviceType: childFilter });
    toast.success("子服务已创建");
  };

  const saveEditChild = async () => {
    if (!editDraft) return;
    setSaving(true);
    setActionError(null);
    const res = await requestJson<ServiceCatalogResponse>(`/api/service-catalog/manage/${editDraft.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceType: editDraft.serviceType,
        category: editDraft.category,
        name: editDraft.name,
        personalLinkCode: editDraft.personalLinkCode,
        dealershipLinkCode: editDraft.dealershipLinkCode,
        isActive: editDraft.isActive,
        sortOrder: editDraft.sortOrder,
      }),
    });
    setSaving(false);

    if (!res.ok || !res.data) {
      setActionError(res.error || "Failed to update child service.");
      return;
    }

    await Promise.all([loadRows(), loadInventoryItems()]);
    setEditingId(null);
    setEditDraft(null);
    toast.success("子服务已更新");
  };

  const deleteRow = async (row: ServiceCatalogRow) => {
    if (!window.confirm(`删除子服务 “${row.name}”？`)) return;
    setSaving(true);
    setActionError(null);
    const res = await requestJson<{ success: boolean }>(`/api/service-catalog/manage/${row.id}`, {
      method: "DELETE",
    });
    setSaving(false);

    if (!res.ok) {
      setActionError(res.error || "Failed to delete child service.");
      return;
    }

    await loadRows();
    toast.success("子服务已删除");
  };

  const Toggle = ({
    checked,
    onChange,
    disabled,
  }: {
    checked: boolean;
    onChange?: (next: boolean) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={() => (!disabled ? onChange?.(!checked) : null)}
      className={[
        "relative inline-flex h-6 w-11 items-center rounded-full transition",
        checked ? "bg-[rgba(37,99,235,0.8)]" : "bg-[rgba(0,0,0,0.2)]",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
      aria-pressed={checked}
    >
      <span
        className={[
          "inline-block h-5 w-5 rounded-full bg-white shadow transition",
          checked ? "translate-x-5" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );

  return (
    <div className="space-y-4 text-[14px]">
      <div>
        <h1 className="text-2xl font-semibold text-[rgba(0,0,0,0.72)]">Service Settings</h1>
      </div>

      {loadError ? <Alert variant="error" description={loadError} onClose={() => setLoadError(null)} /> : null}
      {actionError ? <Alert variant="error" description={actionError} onClose={() => setActionError(null)} /> : null}

      <Card className="flex min-h-[calc(100vh-180px)] flex-col overflow-visible">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-[rgba(0,0,0,0.7)]">Service Settings</div>
            <button
              type="button"
              className={`rounded-[8px] px-3 py-1.5 text-sm ${childFilter === "wof" ? "bg-[var(--ds-primary)] text-white" : "bg-[rgba(0,0,0,0.05)] text-[rgba(0,0,0,0.7)]"}`}
              onClick={() => setChildFilter("wof")}
            >
              WOF
            </button>
            <button
              type="button"
              className={`rounded-[8px] px-3 py-1.5 text-sm ${childFilter === "mech" ? "bg-[var(--ds-primary)] text-white" : "bg-[rgba(0,0,0,0.05)] text-[rgba(0,0,0,0.7)]"}`}
              onClick={() => setChildFilter("mech")}
            >
              机修
            </button>
            <button
              type="button"
              className={`rounded-[8px] px-3 py-1.5 text-sm ${childFilter === "paint" ? "bg-[var(--ds-primary)] text-white" : "bg-[rgba(0,0,0,0.05)] text-[rgba(0,0,0,0.7)]"}`}
              onClick={() => setChildFilter("paint")}
            >
              喷漆
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Input
              className="w-[220px]"
              placeholder="搜索服务..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button className="min-w-[88px]" variant="primary" leftIcon={<Plus size={16} />} onClick={startAdd}>
              添加
            </Button>
          </div>
        </div>

        {adding ? (
          <div className="grid grid-cols-[88px_260px_500px_500px_72px_minmax(88px,1fr)] gap-2 px-4 py-3 hover:bg-[rgba(0,0,0,0.02)]">
            <div className="text-xs text-[rgba(0,0,0,0.6)]">{serviceTypeLabel(draft.serviceType)}</div>
            <Input value={draft.name} placeholder="子服务名称" onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} />
            <InventoryLinkCodeInput
              value={draft.personalLinkCode}
              placeholder="Personal link code"
              options={inventoryItems}
              onChange={(next) => setDraft((prev) => ({ ...prev, personalLinkCode: next }))}
            />
            <InventoryLinkCodeInput
              value={draft.dealershipLinkCode}
              placeholder="Dealership link code"
              options={inventoryItems}
              onChange={(next) => setDraft((prev) => ({ ...prev, dealershipLinkCode: next }))}
            />
            <div>
              <Toggle checked={draft.isActive} onChange={(next) => setDraft((prev) => ({ ...prev, isActive: next }))} />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="primary" onClick={() => void saveNewChild()} disabled={!draft.name.trim() || saving}>Save</Button>
              <Button onClick={cancelAdd} disabled={saving}>Cancel</Button>
            </div>
          </div>
        ) : null}

        <div className="flex-1">
        {loading ? (
          <div className="py-10 text-center text-sm text-[rgba(0,0,0,0.45)]">加载中...</div>
        ) : pagination.totalItems === 0 ? (
          <EmptyState message="暂无子服务" />
        ) : (
          <div className="overflow-x-auto overflow-y-visible">
            <div className="min-w-[1560px]">
              <div className="grid grid-cols-[88px_260px_500px_500px_72px_minmax(88px,1fr)] gap-2 border-b border-[rgba(0,0,0,0.06)] px-4 py-3 text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">
                <div>Type</div>
                <div>Name</div>
                <div>Personal Link Code</div>
                <div>Dealership Link Code</div>
                <div className="text-right">Active</div>
                <div className="text-right pr-2">操作</div>
              </div>
            {pagination.pageRows.map((row, index) => {
              const editing = editingId === row.id && editDraft;
              return (
                <div
                  key={row.id}
                  className={[
                    "group grid grid-cols-[88px_260px_500px_500px_72px_minmax(88px,1fr)] gap-2 px-4 py-3 transition hover:bg-[rgba(239,68,68,0.08)]",
                    index % 2 === 0 ? "bg-white" : "bg-[rgba(0,0,0,0.02)]",
                  ].join(" ")}
                >
                  <div className="text-xs text-[rgba(0,0,0,0.6)]">{serviceTypeLabel(row.serviceType)}</div>
                  <div>
                    {editing ? (
                      <Input
                        value={editDraft.name}
                        placeholder="子服务名称"
                        onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })}
                      />
                    ) : (
                      <div className="truncate">{row.name}</div>
                    )}
                  </div>
                  <div>
                    {editing ? (
                      <InventoryLinkCodeInput
                        value={editDraft.personalLinkCode}
                        placeholder="Personal link code"
                        options={inventoryItems}
                        onChange={(next) => setEditDraft({ ...editDraft, personalLinkCode: next })}
                      />
                    ) : (
                      <InventoryItemValue code={row.personalLinkCode} matchedItem={inventoryItemMap.get(row.personalLinkCode)} />
                    )}
                  </div>
                  <div>
                    {editing ? (
                      <InventoryLinkCodeInput
                        value={editDraft.dealershipLinkCode}
                        placeholder="Dealership link code"
                        options={inventoryItems}
                        onChange={(next) => setEditDraft({ ...editDraft, dealershipLinkCode: next })}
                      />
                    ) : (
                      <InventoryItemValue code={row.dealershipLinkCode} matchedItem={inventoryItemMap.get(row.dealershipLinkCode)} />
                    )}
                  </div>
                  <div className="flex justify-end">
                    <Toggle
                      checked={editing ? editDraft.isActive : row.isActive}
                      onChange={editing ? (next) => setEditDraft({ ...editDraft, isActive: next }) : undefined}
                      disabled={!editing}
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    {editing ? (
                      <>
                        <Button variant="primary" onClick={() => void saveEditChild()} disabled={!editDraft.name.trim() || saving}>Save</Button>
                        <Button onClick={cancelEdit} disabled={saving}>Cancel</Button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[rgba(0,0,0,0.5)] hover:text-[rgba(0,0,0,0.75)]"
                          title="Edit"
                          onClick={() => startEdit(row)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[rgba(239,68,68,0.9)] hover:text-[rgba(239,68,68,1)]"
                          title="Delete"
                          onClick={() => void deleteRow(row)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        )}
        </div>
        {pagination.totalItems > 0 ? (
          <Pagination
            className="mt-auto border-t border-[rgba(0,0,0,0.06)]"
            currentPage={safePage}
            totalPages={pagination.totalPages}
            pageSize={pageSize}
            totalItems={pagination.totalItems}
            onPageChange={setCurrentPage}
          />
        ) : null}
      </Card>
    </div>
  );
}
