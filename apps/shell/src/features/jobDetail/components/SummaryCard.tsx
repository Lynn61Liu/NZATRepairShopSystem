import { useEffect, useState } from "react";
import { Car, User, Building2, Phone, Mail, Link, RefreshCw, Pencil } from "lucide-react";
import { Button, Card, Input, Select, Textarea } from "@/components/ui";
import { CustomerUpdateProgressDialog } from "@/components/common/CustomerUpdateProgressDialog";
import { VehicleNztaSyncDialog } from "@/components/common/VehicleNztaSyncDialog";
import {
  createInitialCustomerUpdateSteps,
  resolveCustomerUpdateSteps,
  type CustomerUpdateApiSteps,
  type CustomerUpdateSteps,
} from "@/components/common/CustomerUpdateProgressDialogState";
import {
  createInitialVehicleNztaSyncSteps,
  createSyncingVehicleNztaSyncSteps,
  resolveVehicleNztaSyncDialogSteps,
  type VehicleNztaSyncApiSteps,
  type VehicleNztaSyncDialogSteps,
} from "@/components/common/VehicleNztaSyncDialogState";
import { loadBusinessCustomersCacheFirst } from "@/features/lookups/lookupCache";
import { getCustomerContactHref } from "@/features/jobDetail/contactActions";
import type { VehicleInfo, CustomerInfo } from "@/types";

interface SummaryCardProps {
  vehicle: VehicleInfo;
  customer: CustomerInfo;
  onRefreshVehicle?: () => Promise<{ success: boolean; message?: string }>;
  onSaveVehicle?: (payload: {
    year?: number | null;
    make?: string | null;
    fuelType?: string | null;
    vin?: string | null;
    nzFirstRegistration?: string | null;
  }) => Promise<{ success: boolean; message?: string }>;
  onSyncVehicleNzta?: () => Promise<{ success: boolean; message?: string; steps?: VehicleNztaSyncApiSteps }>;
  onSaveCustomer?: (
    payload:
      | { type: "Business"; customerId: string }
      | { type: "Personal"; name: string; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null }
  ) => Promise<{ success: boolean; message?: string; steps?: CustomerUpdateApiSteps; invoice?: unknown }>;
}

type BusinessCustomerOption = {
  id: string;
  label: string;
  businessCode?: string;
};

export function SummaryCard({
  vehicle,
  customer,
  onRefreshVehicle,
  onSaveVehicle,
  onSyncVehicleNzta,
  onSaveCustomer,
}: SummaryCardProps) {
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(false);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerSaveError, setCustomerSaveError] = useState<string | null>(null);
  const [customerUpdateProgressOpen, setCustomerUpdateProgressOpen] = useState(false);
  const [customerUpdateProgressError, setCustomerUpdateProgressError] = useState<string | null>(null);
  const [customerUpdateSteps, setCustomerUpdateSteps] = useState<CustomerUpdateSteps>(createInitialCustomerUpdateSteps);
  const [contactActionOpen, setContactActionOpen] = useState(false);
  const [vehicleNztaSyncOpen, setVehicleNztaSyncOpen] = useState(false);
  const [vehicleNztaSyncPhase, setVehicleNztaSyncPhase] = useState<"confirm" | "status">("confirm");
  const [vehicleNztaSyncError, setVehicleNztaSyncError] = useState<string | null>(null);
  const [vehicleNztaSyncSteps, setVehicleNztaSyncSteps] = useState<VehicleNztaSyncDialogSteps>(
    createInitialVehicleNztaSyncSteps
  );
  const [syncingVehicleNzta, setSyncingVehicleNzta] = useState(false);
  const [businessCustomers, setBusinessCustomers] = useState<BusinessCustomerOption[]>([]);
  const [selectedBusinessCustomerId, setSelectedBusinessCustomerId] = useState(customer.id ?? "");
  const [customerForm, setCustomerForm] = useState({
    name: customer.name ?? "",
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    address: customer.address ?? "",
    notes: customer.notes ?? "",
  });
  const [vehicleForm, setVehicleForm] = useState({
    year: "",
    make: "",
    fuelType: "",
    vin: "",
    nzFirstRegistration: "",
  });

  useEffect(() => {
    if (!refreshMessage) return;
    const timer = window.setTimeout(() => setRefreshMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [refreshMessage]);

  useEffect(() => {
    if (!refreshError) return;
    const timer = window.setTimeout(() => setRefreshError(null), 3000);
    return () => window.clearTimeout(timer);
  }, [refreshError]);

  useEffect(() => {
    setSelectedBusinessCustomerId(customer.id ?? "");
    setCustomerForm({
      name: customer.name ?? "",
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      address: customer.address ?? "",
      notes: customer.notes ?? "",
    });
    setCustomerSaveError(null);
    setEditingCustomer(false);
    setContactActionOpen(false);
  }, [customer]);

  useEffect(() => {
    if (!editingCustomer || customer.type !== "Business" || businessCustomers.length > 0) return;

    let cancelled = false;
    const loadCustomers = async () => {
      try {
        const options = await loadBusinessCustomersCacheFirst();
        if (cancelled) return;
        setBusinessCustomers(
          (options ?? []).map((item) => ({
            id: String(item.id ?? ""),
            label: String(item.label ?? ""),
            businessCode: item.businessCode ? String(item.businessCode) : "",
          }))
        );
      } catch {
        if (!cancelled) {
          setCustomerSaveError("加载商户列表失败");
        }
      }
    };

    void loadCustomers();
    return () => {
      cancelled = true;
    };
  }, [businessCustomers.length, customer.type, editingCustomer]);

  const handleRefreshVehicle = async () => {
    if (!onRefreshVehicle || refreshing) return;
    setRefreshing(true);
    setRefreshMessage(null);
    setRefreshError(null);
    try {
      const result = await onRefreshVehicle();
      if (result.success) {
        setRefreshMessage(result.message || "抓取成功");
      } else {
        setRefreshError(result.message || "抓取失败，请稍后重试");
      }
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "抓取失败，请稍后重试");
    } finally {
      setRefreshing(false);
    }
  };

  const openVehicleNztaSync = () => {
    setVehicleNztaSyncOpen(true);
    setVehicleNztaSyncPhase("confirm");
    setVehicleNztaSyncError(null);
    setVehicleNztaSyncSteps(createInitialVehicleNztaSyncSteps());
  };

  const closeVehicleNztaSync = () => {
    if (syncingVehicleNzta) return;
    setVehicleNztaSyncOpen(false);
  };

  const handleVehicleNztaSync = async () => {
    if (!onSyncVehicleNzta || syncingVehicleNzta) return;

    setSyncingVehicleNzta(true);
    setVehicleNztaSyncPhase("status");
    setVehicleNztaSyncError(null);
    setVehicleNztaSyncSteps(createSyncingVehicleNztaSyncSteps());

    try {
      const result = await onSyncVehicleNzta();
      setVehicleNztaSyncSteps(resolveVehicleNztaSyncDialogSteps(result.steps, result.success));
      setVehicleNztaSyncError(result.success ? null : result.message || "NZTA 同步失败");
    } catch (err) {
      const message = err instanceof Error ? err.message : "NZTA 同步失败";
      setVehicleNztaSyncSteps(resolveVehicleNztaSyncDialogSteps(undefined, false));
      setVehicleNztaSyncError(message);
    } finally {
      setSyncingVehicleNzta(false);
    }
  };

  const openEditVehicle = () => {
    setVehicleForm({
      year: vehicle.year ? String(vehicle.year) : "",
      make: vehicle.make ?? "",
      fuelType: vehicle.fuelType ?? "",
      vin: vehicle.vin ?? "",
      nzFirstRegistration: vehicle.nzFirstRegistration ?? "",
    });
    setSaveError(null);
    setEditingVehicle(true);
  };

  const handleSaveVehicle = async () => {
    if (!onSaveVehicle || savingVehicle) return;
    const yearValue = vehicleForm.year.trim();
    const parsedYear = yearValue ? Number(yearValue) : null;
    if (yearValue && !Number.isFinite(parsedYear)) {
      setSaveError("年份格式不正确");
      return;
    }

    setSavingVehicle(true);
    setSaveError(null);
    const res = await onSaveVehicle({
      year: parsedYear,
      make: vehicleForm.make.trim() || null,
      fuelType: vehicleForm.fuelType.trim() || null,
      vin: vehicleForm.vin.trim() || null,
      nzFirstRegistration: vehicleForm.nzFirstRegistration.trim() || null,
    });
    setSavingVehicle(false);
    if (res.success) {
      setEditingVehicle(false);
    } else {
      setSaveError(res.message || "保存失败");
    }
  };

  const openEditCustomer = () => {
    setSelectedBusinessCustomerId(customer.id ?? "");
    setCustomerForm({
      name: customer.name ?? "",
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      address: customer.address ?? "",
      notes: customer.notes ?? "",
    });
    setCustomerSaveError(null);
    setEditingCustomer(true);
  };

  const cancelEditCustomer = () => {
    setCustomerSaveError(null);
    setEditingCustomer(false);
    setSelectedBusinessCustomerId(customer.id ?? "");
    setCustomerForm({
      name: customer.name ?? "",
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      address: customer.address ?? "",
      notes: customer.notes ?? "",
    });
  };

  const handleSaveCustomer = async () => {
    if (!onSaveCustomer || savingCustomer) return;
    if (customer.type === "Business" && !selectedBusinessCustomerId) {
      setCustomerSaveError("请选择商户");
      return;
    }
    if (customer.type === "Personal" && !customerForm.name.trim()) {
      setCustomerSaveError("姓名不能为空");
      return;
    }

    setSavingCustomer(true);
    setCustomerSaveError(null);
    if (customer.type === "Business") {
      setCustomerUpdateSteps(createInitialCustomerUpdateSteps());
      setCustomerUpdateProgressError(null);
      setCustomerUpdateProgressOpen(true);
    }
    const result =
      customer.type === "Business"
        ? await onSaveCustomer({ type: "Business", customerId: selectedBusinessCustomerId })
        : await onSaveCustomer({
            type: "Personal",
            name: customerForm.name.trim(),
            phone: customerForm.phone.trim() || null,
            email: customerForm.email.trim() || null,
            address: customerForm.address.trim() || null,
            notes: customerForm.notes.trim() || null,
          });
    setSavingCustomer(false);
    if (customer.type === "Business") {
      setCustomerUpdateSteps(
        result.steps
          ? resolveCustomerUpdateSteps(result.steps)
          : {
              replacement: {
                status: "failed",
                message: result.message || "商户关联更新失败。",
              },
              invoice: {
                status: "pending",
                message: "未开始更新 invoice Contact Name。",
              },
            }
      );
      setCustomerUpdateProgressError(result.success ? null : result.message || "保存失败");
    }
    if (!result.success) {
      setCustomerSaveError(result.message || "保存失败");
      return;
    }
    setEditingCustomer(false);
  };

  const renderVehicleValue = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return "";
    return String(value);
  };
  const customerTelHref = getCustomerContactHref("tel", customer.phone);
  const customerSmsHref = getCustomerContactHref("sms", customer.phone);
  const customerPhoneIsClickable = Boolean(customerTelHref && customerSmsHref);

  return (
    <Card className="p-6">
      <div className="grid grid-cols-2 gap-6">
        {/* Vehicle Column */}
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 rounded-lg bg-[var(--ds-border)] flex items-center justify-center">
              <Car className="w-6 h-6 text-[var(--ds-primary)]" />
            </div>
          </div>
          <div className="flex-1">
            <p className="text-xs text-[var(--ds-muted)] mb-1">Vehicle</p>
    
            <p className="text-2xl font-semibold text-[var(--ds-text)] mb-1">
              {vehicle.plate}{" "}
              <span className="inline-flex items-center gap-2">
                <a
                  className="text-sm font-medium text-[var(--ds-ghost)] underline underline-offset-2 inline-flex items-center gap-1"
                  href={`https://www.carjam.co.nz/car/?plate=${encodeURIComponent(vehicle.plate)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Link className="w-4 h-4" aria-hidden="true" />
                </a>
                <button
                  type="button"
                  className="text-[var(--ds-ghost)] hover:text-[var(--ds-text)]"
                  onClick={handleRefreshVehicle}
                  aria-label="刷新车辆信息"
                  disabled={refreshing || !onRefreshVehicle}
                >
                  <RefreshCw className={["w-4 h-4", refreshing ? "animate-spin" : ""].join(" ")} />
                </button>
                <button
                  type="button"
                  className="text-[var(--ds-ghost)] hover:text-[var(--ds-text)]"
                  onClick={openEditVehicle}
                  aria-label="编辑车辆信息"
                  disabled={!onSaveVehicle}
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </span>
            </p>
            {refreshMessage ? <div className="text-xs text-green-600">{refreshMessage}</div> : null}
            {refreshError ? <div className="text-xs text-red-600">{refreshError}</div> : null}
            <p className="text-sm text-[var(--ds-muted)]">
              {vehicle.year} - {vehicle.make} {vehicle.model} - {vehicle.fuelType}
            </p>
            <p className="text-sm text-[var(--ds-muted)]">{vehicle.vin}</p>
          
            <p className="text-sm text-[var(--ds-muted)]">
              NZ First Registration: {vehicle.nzFirstRegistration}
            </p>
            <div className="mt-3 rounded-[12px] border border-[rgba(0,0,0,0.08)] bg-[rgba(0,0,0,0.02)] px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ds-muted)]">NZTA Sync</div>
                <button
                  type="button"
                  className="text-[var(--ds-ghost)] hover:text-[var(--ds-text)] disabled:opacity-50"
                  onClick={openVehicleNztaSync}
                  aria-label="同步 NZTA 车辆到期信息"
                  disabled={!onSyncVehicleNzta}
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 space-y-1 text-sm text-[var(--ds-muted)]">
                <p>WOF Expiry: {renderVehicleValue(vehicle.wofExpiry)}</p>
                <p>Licence Expiry: {renderVehicleValue(vehicle.licenceExpiry)}</p>
                <p>RUC Licence Number: {renderVehicleValue(vehicle.rucLicenceNumber)}</p>
                <p>RUC End Distance: {renderVehicleValue(vehicle.rucEndDistance)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Customer Column */}
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 rounded-lg bg-[var(--ds-border)] flex items-center justify-center">
              {customer.type === 'Business' ? (
                <Building2 className="w-6 h-6 text-[var(--ds-primary)]" />
              ) : (
                <User className="w-6 h-6 text-[var(--ds-primary)]" />
              )}
            </div>
          </div>
          <div className="flex-1">
            <p className="text-xs text-[var(--ds-muted)] mb-1">
              Customer ({customer.type}){" "}
              <button
                type="button"
                className="ml-2 text-[var(--ds-ghost)] hover:text-[var(--ds-text)]"
                onClick={openEditCustomer}
                aria-label="编辑客户信息"
                disabled={!onSaveCustomer}
              >
                <Pencil className="inline h-4 w-4" />
              </button>
            </p>
            <p className="text-xl font-semibold text-[var(--ds-text)] mb-2">{customer.name}</p>
            <div className="space-y-1">
              {customer.type === "Business" && customer.businessCode ? (
                <div className="flex items-center gap-2 text-sm text-[var(--ds-muted)]">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Code: {customer.businessCode}</span>
                </div>
              ) : null}
              <div className="flex items-center gap-2 text-sm text-[var(--ds-muted)]">
                <Phone className="w-3.5 h-3.5" />
                {customerPhoneIsClickable ? (
                  <button
                    type="button"
                    className="font-medium text-[var(--ds-primary)] underline underline-offset-2 hover:text-[var(--ds-text)]"
                    onClick={() => setContactActionOpen(true)}
                    aria-label={`联系客户 ${customer.phone}`}
                  >
                    {customer.phone}
                  </button>
                ) : (
                  <span>{customer.phone}</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-[var(--ds-muted)]">
                <Mail className="w-3.5 h-3.5" />
                <span>{customer.email}</span>
              </div>
               <div className="flex items-center gap-2 text-sm text-[var(--ds-muted)]">
                <Building2 className="w-3.5 h-3.5" />
                <span>{customer.address}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {editingVehicle ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-[12px] bg-white p-5 shadow-xl">
            <div className="text-lg font-semibold text-[var(--ds-text)]">编辑车辆信息</div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-[var(--ds-muted)]">年份</label>
                <Input
                  type="number"
                  value={vehicleForm.year}
                  onChange={(event) => setVehicleForm((prev) => ({ ...prev, year: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--ds-muted)]">品牌</label>
                <Input
                  value={vehicleForm.make}
                  onChange={(event) => setVehicleForm((prev) => ({ ...prev, make: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--ds-muted)]">燃油类型</label>
                <Input
                  value={vehicleForm.fuelType}
                  onChange={(event) => setVehicleForm((prev) => ({ ...prev, fuelType: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--ds-muted)]">VIN</label>
                <Input
                  value={vehicleForm.vin}
                  onChange={(event) => setVehicleForm((prev) => ({ ...prev, vin: event.target.value }))}
                />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs text-[var(--ds-muted)]">NZ First Registration</label>
                <Input
                  type="date"
                  value={vehicleForm.nzFirstRegistration}
                  onChange={(event) =>
                    setVehicleForm((prev) => ({ ...prev, nzFirstRegistration: event.target.value }))
                  }
                />
              </div>
            </div>
            {saveError ? <div className="mt-2 text-xs text-red-600">{saveError}</div> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={() => setEditingVehicle(false)} disabled={savingVehicle}>
                取消
              </Button>
              <Button variant="primary" onClick={handleSaveVehicle} disabled={savingVehicle}>
                保存
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {contactActionOpen && customerTelHref && customerSmsHref ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setContactActionOpen(false);
          }}
        >
          <div className="w-full max-w-sm rounded-[12px] bg-white p-5 shadow-xl" role="dialog" aria-modal="true">
            <div className="text-lg font-semibold text-[var(--ds-text)]">联系客户</div>
            <div className="mt-2 text-sm text-[var(--ds-muted)]">{customer.phone}</div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <a
                href={customerTelHref}
                className="inline-flex h-10 items-center justify-center rounded-[8px] bg-[var(--ds-primary)] px-3 text-sm font-medium text-white transition hover:opacity-95"
                onClick={() => setContactActionOpen(false)}
              >
                Tel
              </a>
              <a
                href={customerSmsHref}
                className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[rgba(0,0,0,0.10)] bg-white px-3 text-sm font-medium text-[rgba(0,0,0,0.72)] transition hover:bg-[rgba(0,0,0,0.03)]"
                onClick={() => setContactActionOpen(false)}
              >
                SMS
              </a>
            </div>
            <div className="mt-3 flex justify-end">
              <Button onClick={() => setContactActionOpen(false)}>取消</Button>
            </div>
          </div>
        </div>
      ) : null}
      {editingCustomer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-[12px] bg-white p-5 shadow-xl">
            <div className="text-lg font-semibold text-[var(--ds-text)]">编辑客户信息</div>
            <div className="mt-4 space-y-3">
              {customer.type === "Business" ? (
                <div>
                  <label className="mb-1 block text-xs text-[var(--ds-muted)]">商户</label>
                  <Select
                    value={selectedBusinessCustomerId}
                    onChange={(event) => setSelectedBusinessCustomerId(event.target.value)}
                  >
                    <option value="">请选择商户</option>
                    {businessCustomers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                        {item.businessCode ? ` (${item.businessCode})` : ""}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-xs text-[var(--ds-muted)]">姓名</label>
                    <Input
                      value={customerForm.name}
                      onChange={(event) => setCustomerForm((prev) => ({ ...prev, name: event.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-[var(--ds-muted)]">电话</label>
                      <Input
                        value={customerForm.phone}
                        onChange={(event) => setCustomerForm((prev) => ({ ...prev, phone: event.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-[var(--ds-muted)]">邮箱</label>
                      <Input
                        value={customerForm.email}
                        onChange={(event) => setCustomerForm((prev) => ({ ...prev, email: event.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[var(--ds-muted)]">地址</label>
                    <Input
                      value={customerForm.address}
                      onChange={(event) => setCustomerForm((prev) => ({ ...prev, address: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[var(--ds-muted)]">备注</label>
                    <Textarea
                      rows={4}
                      value={customerForm.notes}
                      onChange={(event) => setCustomerForm((prev) => ({ ...prev, notes: event.target.value }))}
                    />
                  </div>
                </>
              )}
            </div>
            {customerSaveError ? <div className="mt-2 text-xs text-red-600">{customerSaveError}</div> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={cancelEditCustomer} disabled={savingCustomer}>
                取消修改
              </Button>
              <Button variant="primary" onClick={handleSaveCustomer} disabled={savingCustomer}>
                确认修改
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <CustomerUpdateProgressDialog
        open={customerUpdateProgressOpen}
        isUpdating={savingCustomer}
        errorMessage={customerUpdateProgressError}
        steps={customerUpdateSteps}
        onClose={() => setCustomerUpdateProgressOpen(false)}
      />
      <VehicleNztaSyncDialog
        open={vehicleNztaSyncOpen}
        isSyncing={syncingVehicleNzta}
        phase={vehicleNztaSyncPhase}
        errorMessage={vehicleNztaSyncError}
        steps={vehicleNztaSyncSteps}
        onConfirm={() => void handleVehicleNztaSync()}
        onClose={closeVehicleNztaSync}
      />
    </Card>
  );
}
