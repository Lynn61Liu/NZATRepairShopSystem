import { requestJson } from "@/utils/api";
import { getCachedValue, readThroughCache, removeCachedValue, setCachedValue } from "@/utils/localCache";
import type { JobRow } from "@/types/JobType";

export type CachedCustomerSummary = {
  id: string;
  type: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  businessCode: string;
  notes: string;
};

export type CachedCustomerListRow = CachedCustomerSummary & {
  servicePriceCount: number;
  currentYearJobCount: number;
  staffMembers: CachedCustomerStaff[];
};

export type CachedBusinessCustomer = {
  id: string;
  label: string;
  businessCode?: string;
};

export type CachedPersonalCustomer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
};

export type CachedCustomerStaff = {
  name: string;
  title: string;
  email: string;
};

export type CachedCustomerServicePrice = {
  id: string;
  serviceCatalogItemId: string;
  serviceName: string;
  xeroItemCode: string;
  salePrice: number | null;
  isActive: boolean;
};

export type CachedCustomerJob = JobRow;

export type CachedCustomerProfile = {
  id: string;
  type: "Personal" | "Business";
  name: string;
  phone: string;
  email: string;
  address: string;
  businessCode: string;
  notes: string;
  staffMembers: CachedCustomerStaff[];
  servicePrices: CachedCustomerServicePrice[];
  currentYearJobCount: number;
  jobs: JobRow[];
};

export type CachedServiceCatalogItem = {
  id: string | number;
  serviceType: "wof" | "mech" | "paint";
  category: "root" | "child";
  name: string;
  personalLinkCode?: string | null;
  dealershipLinkCode?: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type CachedServiceCatalog = {
  rootServices: CachedServiceCatalogItem[];
  childServices: CachedServiceCatalogItem[];
};

export type CachedInventoryItem = {
  id: string;
  itemCode: string;
  itemName: string;
  salesUnitPrice: number | null;
  status: string;
};

const BUSINESS_CUSTOMER_LIST_KEY = "cache:customers:business-list:v2";
const PERSONAL_CUSTOMER_LIST_KEY = "cache:customers:personal-list:v2";
const CUSTOMER_LIST_KEY = "cache:customers:list:v2";
const CUSTOMER_PROFILE_KEY_PREFIX = "cache:customers:profile:";
const SERVICE_CATALOG_KEY = "cache:service-catalog:v1";
const INVENTORY_ITEMS_KEY = "cache:inventory-items:v1";

function customerProfileKey(id: string) {
  return `${CUSTOMER_PROFILE_KEY_PREFIX}${id}:v1`;
}

function mapCustomerSummary(row: unknown): CachedCustomerSummary {
  const item = (row ?? {}) as Record<string, unknown>;
  return {
    id: String(item.id ?? ""),
    type: String(item.type ?? ""),
    name: String(item.name ?? ""),
    phone: String(item.phone ?? ""),
    email: String(item.email ?? ""),
    address: String(item.address ?? ""),
    businessCode: String(item.businessCode ?? ""),
    notes: String(item.notes ?? ""),
  };
}

function toBusinessCustomer(item: CachedCustomerSummary): CachedBusinessCustomer {
  return {
    id: item.id,
    label: item.name,
    businessCode: item.businessCode || undefined,
  };
}

function toPersonalCustomer(item: CachedCustomerSummary): CachedPersonalCustomer {
  return {
    id: item.id,
    name: item.name,
    phone: item.phone,
    email: item.email,
    address: item.address,
  };
}

function mapCustomerListRow(row: unknown): CachedCustomerListRow {
  const item = (row ?? {}) as Record<string, unknown>;
  return {
    ...mapCustomerSummary(row),
    servicePriceCount: Number(item.servicePriceCount ?? 0) || 0,
    currentYearJobCount: Number(item.currentYearJobCount ?? 0) || 0,
    staffMembers: Array.isArray(item.staffMembers)
      ? item.staffMembers.map((staff) => {
          const member = (staff ?? {}) as Record<string, unknown>;
          return {
            name: String(member.name ?? ""),
            title: String(member.title ?? ""),
            email: String(member.email ?? ""),
          };
        })
      : [],
  };
}

function mapCustomerProfile(data: unknown): CachedCustomerProfile {
  const item = (data ?? {}) as Record<string, unknown>;
  return {
    id: String(item.id ?? ""),
    type: String(item.type ?? "Business") as "Personal" | "Business",
    name: String(item.name ?? ""),
    phone: String(item.phone ?? ""),
    email: String(item.email ?? ""),
    address: String(item.address ?? ""),
    businessCode: String(item.businessCode ?? ""),
    notes: String(item.notes ?? ""),
    staffMembers: Array.isArray(item.staffMembers)
      ? item.staffMembers.map((staff) => {
          const row = (staff ?? {}) as Record<string, unknown>;
          return {
            name: String(row.name ?? ""),
            title: String(row.title ?? ""),
            email: String(row.email ?? ""),
          };
        })
      : [],
    servicePrices: Array.isArray(item.servicePrices)
      ? item.servicePrices.map((price) => {
          const row = (price ?? {}) as Record<string, unknown>;
          return {
            id: String(row.id ?? ""),
            serviceCatalogItemId: String(row.serviceCatalogItemId ?? ""),
            serviceName: String(row.serviceName ?? ""),
            xeroItemCode: String(row.xeroItemCode ?? ""),
            salePrice: typeof row.salePrice === "number" ? row.salePrice : null,
            isActive: Boolean(row.isActive),
          };
        })
      : [],
    currentYearJobCount: Number(item.currentYearJobCount ?? 0) || 0,
    jobs: Array.isArray(item.jobs)
      ? item.jobs.map((job) => {
          const row = (job ?? {}) as Record<string, unknown>;
          return {
            id: String(row.id ?? ""),
            vehicleStatus: String(row.vehicleStatus ?? "Pending") as JobRow["vehicleStatus"],
            urgent: Boolean(row.urgent),
            needsPo: typeof row.needsPo === "boolean" ? row.needsPo : undefined,
            selectedTags: Array.isArray(row.selectedTags) ? row.selectedTags.map((tag) => String(tag ?? "")) : [],
            plate: String(row.plate ?? ""),
            vehicleModel: String(row.vehicleModel ?? ""),
            wofPct: typeof row.wofPct === "number" ? row.wofPct : null,
            mechPct: typeof row.mechPct === "number" ? row.mechPct : null,
            paintPct: typeof row.paintPct === "number" ? row.paintPct : null,
            customerName: String(row.customerName ?? ""),
            customerCode: String(row.customerCode ?? ""),
            customerPhone: String(row.customerPhone ?? ""),
            notes: String(row.notes ?? ""),
            externalInvoiceId: row.externalInvoiceId == null ? undefined : String(row.externalInvoiceId),
            createdAt: String(row.createdAt ?? ""),
          } satisfies JobRow;
        })
      : [],
  };
}

function mapServiceCatalog(data: unknown): CachedServiceCatalog {
  const item = (data ?? {}) as Record<string, unknown>;
  const mapRows = (rows: unknown) =>
    Array.isArray(rows)
      ? rows.map((row) => {
          const entry = (row ?? {}) as Record<string, unknown>;
          const id = typeof entry.id === "string" || typeof entry.id === "number" ? entry.id : String(entry.id ?? "");
          return {
            id,
            serviceType: String(entry.serviceType ?? "wof") as "wof" | "mech" | "paint",
            category: String(entry.category ?? "root") as "root" | "child",
            name: String(entry.name ?? ""),
            personalLinkCode: entry.personalLinkCode == null ? null : String(entry.personalLinkCode),
            dealershipLinkCode: entry.dealershipLinkCode == null ? null : String(entry.dealershipLinkCode),
            isActive: Boolean(entry.isActive),
            sortOrder: Number(entry.sortOrder ?? 0) || 0,
          } satisfies CachedServiceCatalogItem;
        })
      : [];

  return {
    rootServices: mapRows(item.rootServices),
    childServices: mapRows(item.childServices),
  };
}

function mapInventoryItems(data: unknown): CachedInventoryItem[] {
  if (!Array.isArray(data)) return [];

  return data.map((row) => {
    const item = (row ?? {}) as Record<string, unknown>;
    return {
      id: String(item.id ?? ""),
      itemCode: String(item.itemCode ?? ""),
      itemName: String(item.itemName ?? ""),
      salesUnitPrice: typeof item.salesUnitPrice === "number" ? item.salesUnitPrice : null,
      status: String(item.status ?? ""),
    };
  });
}

export function getCachedBusinessCustomers() {
  return getCachedValue<CachedBusinessCustomer[]>(BUSINESS_CUSTOMER_LIST_KEY)?.data ?? null;
}

export function setCachedBusinessCustomers(data: CachedBusinessCustomer[]) {
  setCachedValue(BUSINESS_CUSTOMER_LIST_KEY, data);
}

export function getCachedPersonalCustomers() {
  return getCachedValue<CachedPersonalCustomer[]>(PERSONAL_CUSTOMER_LIST_KEY)?.data ?? null;
}

export function setCachedPersonalCustomers(data: CachedPersonalCustomer[]) {
  setCachedValue(PERSONAL_CUSTOMER_LIST_KEY, data);
}

export function getCachedCustomerList() {
  return getCachedValue<CachedCustomerListRow[]>(CUSTOMER_LIST_KEY)?.data ?? null;
}

export function setCachedCustomerList(data: CachedCustomerListRow[]) {
  setCachedValue(CUSTOMER_LIST_KEY, data);
}

export function getCachedCustomerProfile(id: string) {
  return getCachedValue<CachedCustomerProfile>(customerProfileKey(id))?.data ?? null;
}

export function setCachedCustomerProfile(id: string, data: CachedCustomerProfile) {
  setCachedValue(customerProfileKey(id), data);
}

export function getCachedServiceCatalog() {
  return getCachedValue<CachedServiceCatalog>(SERVICE_CATALOG_KEY)?.data ?? null;
}

export function setCachedServiceCatalog(data: CachedServiceCatalog) {
  setCachedValue(SERVICE_CATALOG_KEY, data);
}

export function getCachedInventoryItems() {
  return getCachedValue<CachedInventoryItem[]>(INVENTORY_ITEMS_KEY)?.data ?? null;
}

export function setCachedInventoryItems(data: CachedInventoryItem[]) {
  setCachedValue(INVENTORY_ITEMS_KEY, data);
}

export function syncCustomerSummaryCaches(rows: CachedCustomerSummary[] | unknown[]) {
  const summaries = rows.map(mapCustomerSummary);

  setCachedBusinessCustomers(
    summaries
      .filter((item) => item.type.toLowerCase() === "business" && item.name.trim())
      .map(toBusinessCustomer)
  );
  setCachedPersonalCustomers(
    summaries
      .filter((item) => item.type.toLowerCase() === "personal" && item.name.trim())
      .map(toPersonalCustomer)
  );

  return summaries;
}

export function syncCustomerListCache(rows: CachedCustomerListRow[] | unknown[]) {
  const mapped = rows.map(mapCustomerListRow);
  setCachedCustomerList(mapped);
  syncCustomerSummaryCaches(mapped);
  return mapped;
}

export async function refreshCustomerSummaryCaches() {
  const res = await requestJson<unknown[]>("/api/customers");
  if (!res.ok || !Array.isArray(res.data)) {
    throw new Error(res.error || "加载客户失败");
  }

  const summaries = syncCustomerSummaryCaches(res.data);

  return {
    summaries,
    businessCustomers: getCachedBusinessCustomers() ?? [],
    personalCustomers: getCachedPersonalCustomers() ?? [],
  };
}

export async function refreshCustomerListCache() {
  const res = await requestJson<unknown[]>("/api/customers");
  if (!res.ok || !Array.isArray(res.data)) {
    throw new Error(res.error || "加载客户失败");
  }

  return syncCustomerListCache(res.data);
}

export async function loadCustomerListCacheFirst() {
  return readThroughCache({
    key: CUSTOMER_LIST_KEY,
    fetcher: refreshCustomerListCache,
  });
}

export async function loadBusinessCustomersCacheFirst() {
  return readThroughCache({
    key: BUSINESS_CUSTOMER_LIST_KEY,
    fetcher: async () => {
      const result = await refreshCustomerSummaryCaches();
      return result.businessCustomers;
    },
  });
}

export async function loadPersonalCustomersCacheFirst() {
  return readThroughCache({
    key: PERSONAL_CUSTOMER_LIST_KEY,
    fetcher: async () => {
      const result = await refreshCustomerSummaryCaches();
      return result.personalCustomers;
    },
  });
}

export async function loadCustomerProfileCacheFirst(id: string) {
  return readThroughCache({
    key: customerProfileKey(id),
    fetcher: async () => {
      const res = await requestJson<unknown>(`/api/customers/${encodeURIComponent(id)}`);
      if (!res.ok || !res.data) {
        throw new Error(res.error || "加载客户详情失败");
      }
      return mapCustomerProfile(res.data);
    },
  });
}

export async function refreshServiceCatalogCache() {
  const res = await requestJson<unknown>("/api/service-catalog");
  if (!res.ok || !res.data) {
    throw new Error(res.error || "加载服务列表失败");
  }

  const mapped = mapServiceCatalog(res.data);
  setCachedServiceCatalog(mapped);
  return mapped;
}

export async function loadServiceCatalogCacheFirst() {
  return readThroughCache({
    key: SERVICE_CATALOG_KEY,
    fetcher: refreshServiceCatalogCache,
  });
}

export async function refreshInventoryItemsCache() {
  const res = await requestJson<unknown[]>("/api/inventory-items/manage");
  if (!res.ok) {
    throw new Error(res.error || "加载 Xero item code 失败");
  }

  const mapped = mapInventoryItems(res.data);
  setCachedInventoryItems(mapped);
  return mapped;
}

export async function loadInventoryItemsCacheFirst() {
  return readThroughCache({
    key: INVENTORY_ITEMS_KEY,
    fetcher: refreshInventoryItemsCache,
  });
}

export function upsertCustomerCaches(profile: CachedCustomerProfile) {
  setCachedCustomerProfile(profile.id, profile);

  const summary: CachedCustomerSummary = {
    id: profile.id,
    type: profile.type,
    name: profile.name,
    phone: profile.phone,
    email: profile.email,
    address: profile.address,
    businessCode: profile.businessCode,
    notes: profile.notes,
  };

  if (profile.type.toLowerCase() === "business") {
    const current = getCachedBusinessCustomers() ?? [];
    const next = current.filter((item) => item.id !== profile.id);
    next.push(toBusinessCustomer(summary));
    next.sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
    setCachedBusinessCustomers(next);

    const personal = getCachedPersonalCustomers() ?? [];
    setCachedPersonalCustomers(personal.filter((item) => item.id !== profile.id));
  } else {
    const personal = getCachedPersonalCustomers() ?? [];
    const next = personal.filter((item) => item.id !== profile.id);
    next.push(toPersonalCustomer(summary));
    next.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    setCachedPersonalCustomers(next);

    const businesses = getCachedBusinessCustomers() ?? [];
    setCachedBusinessCustomers(businesses.filter((item) => item.id !== profile.id));
  }

  const list = getCachedCustomerList();
  if (list) {
    const nextRows = list.filter((item) => item.id !== profile.id);
    nextRows.push({
      ...summary,
      servicePriceCount: profile.servicePrices.length,
      currentYearJobCount: profile.currentYearJobCount,
      staffMembers: profile.staffMembers,
    });
    nextRows.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    setCachedCustomerList(nextRows);
  }
}

export function removeCustomerCaches(id: string) {
  removeCachedValue(customerProfileKey(id));
  setCachedBusinessCustomers((getCachedBusinessCustomers() ?? []).filter((item) => item.id !== id));
  setCachedPersonalCustomers((getCachedPersonalCustomers() ?? []).filter((item) => item.id !== id));
  const list = getCachedCustomerList();
  if (list) {
    setCachedCustomerList(list.filter((item) => item.id !== id));
  }
}

export function invalidateCustomerCaches(id?: string) {
  if (id) {
    removeCachedValue(customerProfileKey(id));
    return;
  }

  removeCachedValue(CUSTOMER_LIST_KEY);
  removeCachedValue(BUSINESS_CUSTOMER_LIST_KEY);
  removeCachedValue(PERSONAL_CUSTOMER_LIST_KEY);
}

export function invalidateServiceCaches() {
  removeCachedValue(SERVICE_CATALOG_KEY);
  removeCachedValue(INVENTORY_ITEMS_KEY);
}
