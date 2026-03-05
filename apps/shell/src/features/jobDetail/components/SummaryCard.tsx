import { useEffect, useMemo, useState } from "react";
import { Car, User, Building2, Phone, Mail, Link, RefreshCw, Pencil } from "lucide-react";
import { Button, Card, Input, Select } from "@/components/ui";
import type { VehicleInfo, CustomerInfo } from "@/types";
import { requestJson } from "@/utils/api";
import { CustomerTypeToggle } from "@/features/newJob/components/CustomerTypeToggle";
import type { CustomerType } from "@/features/newJob/newJob.types";

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
  onSaveCustomer?: (payload: {
    type: "Personal" | "Business";
    customerId?: string;
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
  }) => Promise<{ success: boolean; message?: string }>;
}

export function SummaryCard({
  vehicle,
  customer,
  onRefreshVehicle,
  onSaveVehicle,
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
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [businessOptions, setBusinessOptions] = useState<{ id: string; label: string; businessCode?: string }[]>([]);
  const [businessLoading, setBusinessLoading] = useState(false);
  const [businessSearch, setBusinessSearch] = useState("");
  const [customerType, setCustomerType] = useState<CustomerType>("personal");
  const [initialCustomerType, setInitialCustomerType] = useState<CustomerType>("personal");
  const [vehicleForm, setVehicleForm] = useState({
    year: "",
    make: "",
    fuelType: "",
    vin: "",
    nzFirstRegistration: "",
  });
  const [customerForm, setCustomerForm] = useState({
    businessId: "",
    name: "",
    phone: "",
    email: "",
    address: "",
  });

  const filteredBusinesses = useMemo(() => {
    const keyword = businessSearch.trim().toLowerCase();
    if (!keyword) return businessOptions;
    return businessOptions.filter((biz) => biz.label.toLowerCase().includes(keyword));
  }, [businessOptions, businessSearch]);

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
    let cancelled = false;
    const loadBusinesses = async () => {
      setBusinessLoading(true);
      const res = await requestJson<any>("/api/customers");
      if (!cancelled) {
        if (res.ok) {
          const list = Array.isArray(res.data) ? res.data : [];
          const businesses = list
            .filter((item) => String(item?.type || "").toLowerCase() === "business")
            .map((item) => ({
              id: String(item.id),
              label: String(item.name || ""),
              businessCode: item.businessCode ? String(item.businessCode) : undefined,
            }))
            .filter((item) => item.label);
          setBusinessOptions(businesses);
        } else {
          setBusinessOptions([]);
        }
        setBusinessLoading(false);
      }
    };
    loadBusinesses();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!editingCustomer) return;
    if (customerType !== "business") return;
    if (customerForm.businessId) return;
    if (!businessOptions.length) return;
    const match =
      businessOptions.find((biz) => biz.id === customer.id) ||
      businessOptions.find((biz) => biz.label === customer.name);
    if (match) {
      setCustomerForm((prev) => ({ ...prev, businessId: match.id }));
    }
  }, [editingCustomer, customerType, businessOptions, customerForm.businessId, customer.id, customer.name]);

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

  const openEditCustomer = () => {
    const nextType = String(customer.type || "").toLowerCase() === "business" ? "business" : "personal";
    setCustomerType(nextType as CustomerType);
    setInitialCustomerType(nextType as CustomerType);
    setCustomerError(null);
    setBusinessSearch("");
    if (nextType === "business") {
      setCustomerForm({
        businessId: customer.id ? String(customer.id) : "",
        name: "",
        phone: "",
        email: "",
        address: "",
      });
    } else {
      setCustomerForm({
        businessId: "",
        name: customer.name ?? "",
        phone: customer.phone ?? "",
        email: customer.email ?? "",
        address: customer.address ?? "",
      });
    }
    setEditingCustomer(true);
  };

  useEffect(() => {
    if (!editingCustomer) return;
    if (customerType === "personal") {
      if (initialCustomerType === "business") {
        setCustomerForm({
          businessId: "",
          name: "",
          phone: "",
          email: "",
          address: "",
        });
      }
    } else {
      setCustomerForm((prev) => ({
        ...prev,
        businessId: initialCustomerType === "business" ? prev.businessId : "",
      }));
    }
  }, [customerType, editingCustomer, initialCustomerType]);

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

  const handleSaveCustomer = async () => {
    if (!onSaveCustomer || savingCustomer) return;
    setCustomerError(null);

    if (customerType === "business") {
      if (!customerForm.businessId) {
        setCustomerError("请选择商户");
        return;
      }
      setSavingCustomer(true);
      const res = await onSaveCustomer({ type: "Business", customerId: customerForm.businessId });
      setSavingCustomer(false);
      if (res.success) {
        setEditingCustomer(false);
      } else {
        setCustomerError(res.message || "保存失败");
      }
      return;
    }

    const name = customerForm.name.trim();
    if (!name) {
      setCustomerError("请输入客户名称");
      return;
    }
    setSavingCustomer(true);
    const res = await onSaveCustomer({
      type: "Personal",
      name,
      phone: customerForm.phone.trim() || undefined,
      email: customerForm.email.trim() || undefined,
      address: customerForm.address.trim() || undefined,
    });
    setSavingCustomer(false);
    if (res.success) {
      setEditingCustomer(false);
    } else {
      setCustomerError(res.message || "保存失败");
    }
  };

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

            <p className="text-sm text-[var(--ds-muted)]">NZ First Registration: {vehicle.nzFirstRegistration}</p>
          </div>
        </div>

        {/* Customer Column */}
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 rounded-lg bg-[var(--ds-border)] flex items-center justify-center">
              {customer.type === "Business" ? (
                <Building2 className="w-6 h-6 text-[var(--ds-primary)]" />
              ) : (
                <User className="w-6 h-6 text-[var(--ds-primary)]" />
              )}
            </div>
          </div>
          <div className="flex-1">
            <p className="text-xs text-[var(--ds-muted)] mb-1">Customer ({customer.type})</p>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xl font-semibold text-[var(--ds-text)]">{customer.name}</p>
              <button
                type="button"
                className="text-[var(--ds-ghost)] hover:text-[var(--ds-text)]"
                onClick={openEditCustomer}
                aria-label="编辑客户信息"
                disabled={!onSaveCustomer}
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1">
              {customer.type === "Business" && customer.businessCode ? (
                <div className="flex items-center gap-2 text-sm text-[var(--ds-muted)]">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Code: {customer.businessCode}</span>
                </div>
              ) : null}
              <div className="flex items-center gap-2 text-sm text-[var(--ds-muted)]">
                <Phone className="w-3.5 h-3.5" />
                <span>{customer.phone}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[var(--ds-muted)]">
                <Mail className="w-3.5 h-3.5" />
                <span>{customer.email}</span>
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
      {editingCustomer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-[12px] bg-white p-5 shadow-xl">
            <div className="text-lg font-semibold text-[var(--ds-text)]">编辑客户信息</div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-base text-[rgba(0,0,0,0.55)] mb-2 block">客户类型</label>
                <CustomerTypeToggle value={customerType} onChange={setCustomerType} />
              </div>
              {customerType === "personal" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-base text-[rgba(0,0,0,0.55)] mb-1 block">名字</label>
                    <Input
                      placeholder="输入客户名字"
                      value={customerForm.name}
                      onChange={(event) => setCustomerForm((prev) => ({ ...prev, name: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-base text-[rgba(0,0,0,0.55)] mb-1 block">电话</label>
                    <Input
                      placeholder="输入电话"
                      value={customerForm.phone}
                      onChange={(event) => setCustomerForm((prev) => ({ ...prev, phone: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-base text-[rgba(0,0,0,0.55)] mb-1 block">邮箱</label>
                    <Input
                      placeholder="输入邮箱"
                      value={customerForm.email}
                      onChange={(event) => setCustomerForm((prev) => ({ ...prev, email: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-base text-[rgba(0,0,0,0.55)] mb-1 block">地址</label>
                    <Input
                      placeholder="输入地址"
                      value={customerForm.address}
                      onChange={(event) => setCustomerForm((prev) => ({ ...prev, address: event.target.value }))}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-base text-[rgba(0,0,0,0.55)] mb-1 block">搜索商户</label>
                    <Input
                      placeholder="输入商户名称"
                      value={businessSearch}
                      onChange={(event) => setBusinessSearch(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-base text-[rgba(0,0,0,0.55)] mb-1 block">
                      选择商户 <span className="text-red-500">*</span>
                    </label>
                    <Select
                      value={customerForm.businessId}
                      onChange={(event) => setCustomerForm((prev) => ({ ...prev, businessId: event.target.value }))}
                      disabled={businessLoading}
                    >
                      <option value="">-- 请选择 --</option>
                      {filteredBusinesses.map((biz) => (
                        <option key={biz.id} value={biz.id}>
                          {biz.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              )}
            </div>
            {customerError ? <div className="mt-2 text-xs text-red-600">{customerError}</div> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={() => setEditingCustomer(false)} disabled={savingCustomer}>
                取消
              </Button>
              <Button variant="primary" onClick={handleSaveCustomer} disabled={savingCustomer}>
                保存
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
