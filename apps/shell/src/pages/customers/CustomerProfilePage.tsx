import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Alert, Button, Card, Input, useToast } from "@/components/ui";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import {
  loadCustomerProfileCacheFirst,
  loadInventoryItemsCacheFirst,
  loadServiceCatalogCacheFirst,
  upsertCustomerCaches,
} from "@/features/lookups/lookupCache";
import { requestJson } from "@/utils/api";
import { JobsTable } from "@/pages/jobs/JobsTable";
import type { JobRow } from "@/types/JobType";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

type CustomerStaff = {
  name: string;
  title: string;
  email: string;
};

type CustomerServicePrice = {
  id: string;
  serviceCatalogItemId: string;
  serviceName: string;
  xeroItemCode: string;
  salePrice: number | null;
  isActive: boolean;
};

type CustomerProfile = {
  id: string;
  type: "Personal" | "Business";
  name: string;
  phone: string;
  email: string;
  address: string;
  businessCode: string;
  notes: string;
  staffMembers: CustomerStaff[];
  servicePrices: CustomerServicePrice[];
  currentYearJobCount: number;
  jobs: JobRow[];
};

type ServiceOption = {
  id: string;
  name: string;
  serviceType: string;
  categoryLabel: string;
};

type InventoryItemOption = {
  id: string;
  itemCode: string;
  itemName: string;
  salesUnitPrice: number | null;
  status: string;
};

type ServicePriceDraftRow = {
  id: string;
  serviceCatalogItemId: string;
  xeroItemCode: string;
  isActive: boolean;
};

const blankProfile: CustomerProfile = {
  id: "",
  type: "Business",
  name: "",
  phone: "",
  email: "",
  address: "",
  businessCode: "",
  notes: "",
  staffMembers: [],
  servicePrices: [],
  currentYearJobCount: 0,
  jobs: [],
};

function formatSalesPrice(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "-";
  return `$${value.toFixed(2)}`;
}

function serviceTypeLabel(value: string) {
  if (value === "wof") return "WOF";
  if (value === "mech") return "机修";
  if (value === "paint") return "喷漆";
  return value;
}

function formatServiceLabel(name: string, categoryLabel: string) {
  return categoryLabel ? `${name}（${categoryLabel}）` : name;
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-6 w-11 items-center rounded-full transition",
        checked ? "bg-[rgba(37,99,235,0.8)]" : "bg-[rgba(0,0,0,0.2)]",
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
}

function PortalSelectInput<T>({
  value,
  onChange,
  options,
  placeholder,
  getValue,
  getSearchText,
  renderOption,
  renderValue,
}: {
  value: string;
  onChange: (next: string) => void;
  options: T[];
  placeholder: string;
  getValue: (item: T) => string;
  getSearchText: (item: T) => string;
  renderOption: (item: T, active: boolean) => ReactNode;
  renderValue: (item: T | null) => string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState({ top: 0, left: 0, width: 420 });
  const blurTimer = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selected = useMemo(() => options.find((item) => getValue(item) === value) ?? null, [getValue, options, value]);
  const query = selected ? "" : value.trim().toLowerCase();

  const filteredOptions = useMemo(() => {
    if (!query || (selected && renderValue(selected).toLowerCase() === query)) return options;
    return options.filter((item) => getSearchText(item).toLowerCase().includes(query));
  }, [getSearchText, options, query, renderValue, selected]);

  useEffect(() => {
    setActiveIndex(filteredOptions.length > 0 ? 0 : -1);
  }, [filteredOptions.length]);

  const updateDropdownDirection = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const width = Math.min(460, viewportWidth - 48);
    const estimatedHeight = Math.min(Math.floor(viewportHeight * 0.72), Math.max(220, filteredOptions.length * 32)) + 12;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
    const left = Math.max(24, Math.min(rect.left, viewportWidth - width - 24));
    const top = openUpward
      ? Math.max(16, rect.top - estimatedHeight - 8)
      : Math.min(rect.bottom + 8, viewportHeight - estimatedHeight - 16);
    setDropdownStyle({ top, left, width });
  };

  const commit = (next: string) => {
    onChange(next);
    setOpen(false);
    setActiveIndex(-1);
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
      commit(getValue(filteredOptions[activeIndex]));
      return;
    }
    if (event.key === "Escape") setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={selected ? renderValue(selected) : value}
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
                <ul className="max-h-[72vh] overflow-y-auto py-1 pr-1 [scrollbar-gutter:stable]">
                  {filteredOptions.map((item, index) => (
                    <li key={getValue(item)}>
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => commit(getValue(item))}
                        className="w-full px-2 py-1 text-left leading-tight transition hover:bg-[rgba(0,0,0,0.04)]"
                      >
                        {renderOption(item, index === activeIndex)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-3 py-3 text-sm text-[rgba(0,0,0,0.45)]">没有匹配项</div>
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export function CustomerProfilePage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isNew = !id;

  const [profile, setProfile] = useState<CustomerProfile>({
    ...blankProfile,
    type: searchParams.get("type") === "Personal" ? "Personal" : "Business",
  });
  const [serviceOptions, setServiceOptions] = useState<ServiceOption[]>([]);
  const [inventoryOptions, setInventoryOptions] = useState<InventoryItemOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDependencies = async () => {
    const [serviceCatalog, inventoryItems] = await Promise.all([
      loadServiceCatalogCacheFirst(),
      loadInventoryItemsCacheFirst(),
    ]);

    setServiceOptions(
      [...(serviceCatalog.rootServices ?? []), ...(serviceCatalog.childServices ?? [])]
        .filter((item) => item.isActive)
        .map((item) => ({
          id: String(item.id),
          name: item.name,
          serviceType: item.serviceType,
          categoryLabel: serviceTypeLabel(item.serviceType),
        }))
    );
    setInventoryOptions(
      inventoryItems.filter(
        (item) => String(item.status ?? "").toUpperCase() !== "DELETED" && item.salesUnitPrice != null
      )
    );
  };

  const loadProfile = async () => {
    if (isNew) {
      setProfile((prev) => ({ ...blankProfile, type: prev.type }));
      return;
    }

    const data = await loadCustomerProfileCacheFirst(id);
    setProfile(data);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadDependencies();
        if (!cancelled) {
          await loadProfile();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载客户失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const serviceOptionById = useMemo(
    () => new Map(serviceOptions.map((item) => [item.id, item])),
    [serviceOptions]
  );
  const inventoryOptionByCode = useMemo(
    () => new Map(inventoryOptions.map((item) => [item.itemCode, item])),
    [inventoryOptions]
  );

  const servicePriceRows: ServicePriceDraftRow[] = useMemo(
    () =>
      profile.servicePrices.map((row, index) => ({
        id: row.id || `temp-${index}`,
        serviceCatalogItemId: row.serviceCatalogItemId,
        xeroItemCode: row.xeroItemCode,
        isActive: row.isActive,
      })),
    [profile.servicePrices]
  );

  const setServicePriceRows = (updater: (rows: ServicePriceDraftRow[]) => ServicePriceDraftRow[]) => {
    setProfile((prev) => {
      const nextRows = updater(
        prev.servicePrices.map((row, index) => ({
          id: row.id || `temp-${index}`,
          serviceCatalogItemId: row.serviceCatalogItemId,
          xeroItemCode: row.xeroItemCode,
          isActive: row.isActive,
        }))
      );
      return {
        ...prev,
        servicePrices: nextRows.map((row) => {
          const service = serviceOptionById.get(row.serviceCatalogItemId);
          const inventory = inventoryOptionByCode.get(row.xeroItemCode);
          return {
            id: row.id,
            serviceCatalogItemId: row.serviceCatalogItemId,
            serviceName: service?.name ?? "",
            xeroItemCode: row.xeroItemCode,
            salePrice: inventory?.salesUnitPrice ?? null,
            isActive: row.isActive,
          };
        }),
      };
    });
  };

  const addStaff = () => {
    setProfile((prev) => ({
      ...prev,
      staffMembers: [...prev.staffMembers, { name: "", title: "", email: "" }],
    }));
  };

  const updateStaff = (index: number, key: keyof CustomerStaff, value: string) => {
    setProfile((prev) => ({
      ...prev,
      staffMembers: prev.staffMembers.map((row, currentIndex) =>
        currentIndex === index ? { ...row, [key]: value } : row
      ),
    }));
  };

  const removeStaff = (index: number) => {
    setProfile((prev) => ({
      ...prev,
      staffMembers: prev.staffMembers.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const addServicePrice = () => {
    setServicePriceRows((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}-${prev.length}`,
        serviceCatalogItemId: "",
        xeroItemCode: "",
        isActive: true,
      },
    ]);
  };

  const updateServicePrice = (rowId: string, key: keyof ServicePriceDraftRow, value: string | boolean) => {
    setServicePriceRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, [key]: value } : row))
    );
  };

  const removeServicePrice = (rowId: string) => {
    setServicePriceRows((prev) => prev.filter((row) => row.id !== rowId));
  };

  const handleSave = async () => {
    if (!profile.name.trim()) {
      setError("名称不能为空");
      return;
    }

    setSaving(true);
    setError(null);
    const payload = {
      type: profile.type,
      name: profile.name,
      phone: profile.phone,
      email: profile.email,
      address: profile.address,
      businessCode: profile.businessCode,
      notes: profile.notes,
      staffMembers: profile.staffMembers,
      servicePrices: servicePriceRows.map((row) => ({
        id: /^\d+$/.test(row.id) ? Number(row.id) : undefined,
        serviceCatalogItemId: row.serviceCatalogItemId ? Number(row.serviceCatalogItemId) : undefined,
        xeroItemCode: row.xeroItemCode,
        isActive: row.isActive,
      })),
    };

    const res = await requestJson<CustomerProfile>(isNew ? "/api/customers" : `/api/customers/${id}`, {
      method: isNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (!res.ok || !res.data) {
      setError(res.error || "保存失败");
      return;
    }

    upsertCustomerCaches(res.data);
    toast.success(isNew ? "客户已创建" : "客户已更新");
    if (isNew) {
      navigate(`/customers/${res.data.id}`);
      return;
    }
    setProfile(res.data);
  };

  if (loading) {
    return <div className="py-10 text-center text-sm text-[var(--ds-muted)]">加载中...</div>;
  }

  return (
    <div className="space-y-4 text-[14px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/customers")}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(0,0,0,0.08)] bg-white text-[rgba(0,0,0,0.72)] hover:bg-[rgba(0,0,0,0.03)]"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-[rgba(0,0,0,0.72)]">
              {isNew ? "New Customer Profile" : `Customer Profile #${profile.id}`}
            </h1>
            <div className="mt-1 text-sm text-[var(--ds-muted)]">
              {profile.type === "Business" ? "商户客户档案" : "个人客户档案"}
            </div>
          </div>
        </div>

        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      {error ? <Alert variant="error" description={error} onClose={() => setError(null)} /> : null}

      <Card className="space-y-4 p-5">
        <div>
          <div className="text-base font-semibold text-[rgba(0,0,0,0.75)]">Basic Information</div>
          <div className="mt-1 text-sm text-[var(--ds-muted)]">客户基础资料</div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <div className="mb-1 text-xs font-semibold text-[rgba(0,0,0,0.55)]">类型</div>
            <select
              className="h-10 w-full rounded-[10px] border border-[var(--ds-border)] px-3 text-sm"
              value={profile.type}
              onChange={(event) => setProfile((prev) => ({ ...prev, type: event.target.value as "Personal" | "Business" }))}
            >
              <option value="Personal">Personal</option>
              <option value="Business">Business</option>
            </select>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-[rgba(0,0,0,0.55)]">
              {profile.type === "Business" ? "公司名称" : "姓名"}
            </div>
            <Input value={profile.name} onChange={(event) => setProfile((prev) => ({ ...prev, name: event.target.value }))} />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-[rgba(0,0,0,0.55)]">电话</div>
            <Input value={profile.phone} onChange={(event) => setProfile((prev) => ({ ...prev, phone: event.target.value }))} />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-[rgba(0,0,0,0.55)]">Email</div>
            <Input value={profile.email} onChange={(event) => setProfile((prev) => ({ ...prev, email: event.target.value }))} />
          </div>
          <div className="md:col-span-2 xl:col-span-2">
            <div className="mb-1 text-xs font-semibold text-[rgba(0,0,0,0.55)]">地址</div>
            <AddressAutocomplete
              value={profile.address}
              onChange={(value) => setProfile((prev) => ({ ...prev, address: value }))}
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-[rgba(0,0,0,0.55)]">Business Code</div>
            <Input
              value={profile.businessCode}
              onChange={(event) => setProfile((prev) => ({ ...prev, businessCode: event.target.value }))}
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-[rgba(0,0,0,0.55)]">备注</div>
            <Input value={profile.notes} onChange={(event) => setProfile((prev) => ({ ...prev, notes: event.target.value }))} />
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-[rgba(0,0,0,0.75)]">Staff</div>
            <div className="mt-1 text-sm text-[var(--ds-muted)]">显示并维护当前员工信息</div>
          </div>
          <Button onClick={addStaff} leftIcon={<Plus size={16} />}>
            Add Staff
          </Button>
        </div>

        {profile.staffMembers.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-[rgba(0,0,0,0.12)] px-4 py-6 text-sm text-[var(--ds-muted)]">
            目前没有员工信息
          </div>
        ) : (
          <div className="space-y-3">
            {profile.staffMembers.map((staff, index) => (
              <div key={`${index}-${staff.email}`} className="grid gap-3 rounded-[12px] border border-[rgba(0,0,0,0.08)] p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
                <Input
                  placeholder="姓名"
                  value={staff.name}
                  onChange={(event) => updateStaff(index, "name", event.target.value)}
                />
                <Input
                  placeholder="职位"
                  value={staff.title}
                  onChange={(event) => updateStaff(index, "title", event.target.value)}
                />
                <Input
                  placeholder="邮箱"
                  value={staff.email}
                  onChange={(event) => updateStaff(index, "email", event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removeStaff(index)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[rgba(239,68,68,0.9)] hover:bg-[rgba(239,68,68,0.08)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-4 p-5 overflow-visible">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-[rgba(0,0,0,0.75)]">专属服务价格</div>
            <div className="mt-1 text-sm text-[var(--ds-muted)]">为该客户指定服务与 Xero Item Code 的价格映射</div>
          </div>
          <Button onClick={addServicePrice} leftIcon={<Plus size={16} />}>
            Add Service Price
          </Button>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[1.2fr_1.6fr_120px_120px_56px] gap-3 border-b border-[rgba(0,0,0,0.06)] pb-3 text-xs font-semibold text-[rgba(0,0,0,0.55)]">
              <div>Service</div>
              <div>Xero Item Code</div>
              <div>Sale Price</div>
              <div>Active</div>
              <div />
            </div>

            <div className="space-y-3 pt-3">
              {servicePriceRows.length === 0 ? (
                <div className="rounded-[12px] border border-dashed border-[rgba(0,0,0,0.12)] px-4 py-6 text-sm text-[var(--ds-muted)]">
                  目前没有专属服务价格
                </div>
              ) : (
                servicePriceRows.map((row) => {
                  const inventory = inventoryOptionByCode.get(row.xeroItemCode) ?? null;
                  return (
                    <div key={row.id} className="grid grid-cols-[1.2fr_1.6fr_120px_120px_56px] gap-3">
                      <PortalSelectInput
                        value={row.serviceCatalogItemId}
                        onChange={(value) => updateServicePrice(row.id, "serviceCatalogItemId", value)}
                        options={serviceOptions}
                        placeholder="选择 service"
                        getValue={(item) => item.id}
                        getSearchText={(item) => `${item.name} ${item.categoryLabel} ${item.serviceType}`}
                        renderValue={(item) => (item ? formatServiceLabel(item.name, item.categoryLabel) : "")}
                        renderOption={(item, active) => (
                          <div className={active ? "rounded-[8px] bg-[rgba(37,99,235,0.08)] px-2 py-1.5" : "px-2 py-1.5"}>
                            <div className="text-[11px] font-medium leading-[1.2] text-[rgba(0,0,0,0.82)]">
                              {formatServiceLabel(item.name, item.categoryLabel)}
                            </div>
                          </div>
                        )}
                      />

                      <PortalSelectInput
                        value={row.xeroItemCode}
                        onChange={(value) => updateServicePrice(row.id, "xeroItemCode", value)}
                        options={inventoryOptions}
                        placeholder="选择 xero item code"
                        getValue={(item) => item.itemCode}
                        getSearchText={(item) => `${item.itemCode} ${item.itemName}`}
                        renderValue={(item) => (item ? `${item.itemCode} - ${item.itemName}` : "")}
                        renderOption={(item, active) => (
                          <div className={active ? "rounded-[8px] bg-[rgba(37,99,235,0.08)] px-2 py-2" : "px-2 py-2"}>
                            <div className="flex items-center gap-3">
                              <div className="shrink-0 rounded-[8px] border border-[rgba(0,0,0,0.88)] px-2 py-0.5 text-[11px] font-semibold tracking-[0.02em] text-[rgba(0,0,0,0.96)]">
                                {item.itemCode}
                              </div>
                              <div className="min-w-0 flex-1 whitespace-normal break-words text-[13px] font-medium leading-5 text-[rgba(0,0,0,0.82)]">
                                {item.itemName}
                              </div>
                              <div className="shrink-0 text-[11px] text-[rgba(0,0,0,0.64)]">
                                {formatSalesPrice(item.salesUnitPrice)}
                              </div>
                            </div>
                          </div>
                        )}
                      />

                      <div className="flex items-center text-sm text-[rgba(0,0,0,0.72)]">
                        {formatSalesPrice(inventory?.salesUnitPrice ?? null)}
                      </div>
                      <div className="flex items-center">
                        <Toggle checked={row.isActive} onChange={(next) => updateServicePrice(row.id, "isActive", next)} />
                      </div>
                      <div className="flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => removeServicePrice(row.id)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[rgba(239,68,68,0.9)] hover:bg-[rgba(239,68,68,0.08)]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-5 overflow-hidden">
        <div>
          <div className="text-base font-semibold text-[rgba(0,0,0,0.75)]">
            今年服务车辆总数：{profile.currentYearJobCount}
          </div>
          <div className="mt-1 text-sm text-[var(--ds-muted)]">列出该公司名下今年所有 jobs，按时间倒序</div>
        </div>

        {profile.jobs.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-[rgba(0,0,0,0.12)] px-4 py-6 text-sm text-[var(--ds-muted)]">
            今年暂无 jobs
          </div>
        ) : (
          <JobsTable
            rows={profile.jobs}
            onToggleUrgent={async () => {}}
            onArchive={async () => {}}
            onDelete={async () => {}}
            onUpdateCreatedAt={async () => true}
            onPrintMech={async () => {}}
            onPrintPaint={async () => {}}
          />
        )}
      </Card>
    </div>
  );
}
