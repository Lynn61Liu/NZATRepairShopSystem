import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Button, EmptyState, Alert, Input, useToast } from "@/components/ui";
import {
  loadCustomerListCacheFirst,
  removeCustomerCaches,
  syncCustomerListCache,
  type CachedCustomerListRow,
} from "@/features/lookups/lookupCache";
import { withApiBase } from "@/utils/api";
import { Plus, Trash2, Pencil } from "lucide-react";

type CustomerStaff = {
  name: string;
  title: string;
  email: string;
};

type CustomerRow = CachedCustomerListRow;

type CustomerDraft = Omit<CustomerRow, "id" | "servicePriceCount" | "currentYearJobCount">;

export function CustomersPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [previewRows, setPreviewRows] = useState<CustomerDraft[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewType, setViewType] = useState<"Personal" | "Business">("Personal");

  const isBusinessView = viewType === "Business";
  const businessGridTemplate =
    "50px minmax(92px,0.8fr) minmax(180px,1.3fr) minmax(130px,1fr) minmax(180px,1.2fr) minmax(220px,1.5fr) minmax(130px,1fr) minmax(150px,1fr) 120px 120px 120px 120px";
  const personalGridTemplate =
    "50px minmax(92px,0.8fr) minmax(180px,1.3fr) minmax(130px,1fr) minmax(180px,1.2fr) minmax(220px,1.5fr) minmax(130px,1fr) minmax(150px,1fr) 120px";

  const filteredRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    const base = rows.filter((row) => (row.type || "").toLowerCase() === viewType.toLowerCase());
    if (!s) return base;
    return base.filter((row) => {
      const staffText = row.staffMembers.map((member) => [member.name, member.title, member.email].join(" ")).join(" ");
      return [
        row.id,
        row.type,
        row.name,
        row.phone,
        row.email,
        row.address,
        row.businessCode,
        row.notes,
        String(row.servicePriceCount),
        String(row.currentYearJobCount),
        staffText,
      ]
        .join(" ")
        .toLowerCase()
        .includes(s);
    });
  }, [rows, search, viewType]);

  const loadCustomers = async (forceRefresh = false) => {
    setLoading(true);
    setLoadError(null);
    try {
      let mapped: CustomerRow[];

      if (forceRefresh) {
        const res = await fetch(withApiBase("/api/customers"));
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "加载客户失败");
        mapped = syncCustomerListCache(Array.isArray(data) ? data : []);
      } else {
        mapped = await loadCustomerListCacheFirst();
      }

      setRows(mapped);
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载客户失败";
      setRows([]);
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCustomers();
  }, []);

  const csvEscape = (v: string) => {
    const s = (v ?? "").toString();
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const downloadTemplate = () => {
    const header = "type,name,phone,email,address,businessCode,notes";
    const rowsText = [
      ["Personal", "John Doe", "021000000", "john@email.com", "12 Queen St, Auckland", "", "VIP"],
      ["Business", "ABC Motors", "093333333", "info@abc.co.nz", "44 Mount Rd, Auckland", "ABC123", "Dealer"],
    ]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");

    const blob = new Blob([`${header}\n${rowsText}\n`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "customer_import_template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const parseCsv = (text: string): CustomerDraft[] => {
    const input = text.replace(/\uFEFF/g, "");
    const rowsOut: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;

    const pushField = () => {
      row.push(field);
      field = "";
    };
    const pushRow = () => {
      const hasAny = row.some((c) => (c ?? "").trim() !== "");
      if (hasAny) rowsOut.push(row);
      row = [];
    };

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (inQuotes) {
        if (ch === '"') {
          const next = input[i + 1];
          if (next === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        pushField();
      } else if (ch === "\r") {
        if (input[i + 1] === "\n") i++;
        pushField();
        pushRow();
      } else if (ch === "\n") {
        pushField();
        pushRow();
      } else {
        field += ch;
      }
    }

    pushField();
    pushRow();

    if (rowsOut.length < 2) throw new Error("CSV 文件为空或只有表头");

    const headers = rowsOut[0].map((header) => (header ?? "").trim().toLowerCase());
    const get = (obj: Record<string, string>, key: string) => (obj[key] ?? "").toString();

    return rowsOut.slice(1).map((values) => {
      const rowObj: Record<string, string> = {};
      headers.forEach((header, index) => {
        rowObj[header] = (values[index] ?? "").trim();
      });
      return {
        type: get(rowObj, "type") || "Personal",
        name: get(rowObj, "name") || "",
        phone: get(rowObj, "phone") || "",
        email: get(rowObj, "email") || "",
        address: get(rowObj, "address") || "",
        businessCode: get(rowObj, "businesscode") || get(rowObj, "business_code") || "",
        notes: get(rowObj, "notes") || "",
        staffMembers: [],
      };
    });
  };

  const handleCsvSelect = async (file: File) => {
    try {
      const parsed = parseCsv(await file.text());
      setPreviewRows(parsed);
      toast.success(`已读取 ${parsed.length} 条记录`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "读取 CSV 失败";
      setActionError(message);
      toast.error(message);
    }
  };

  const confirmImport = async () => {
    if (!previewRows) return;
    setImporting(true);
    setActionError(null);
    try {
      let importedCount = 0;
      for (const row of previewRows) {
        if (!row.name.trim()) continue;
        const existing = rows.find(
          (item) => item.name === row.name && (item.phone === row.phone || item.email === row.email)
        );
        let existingProfile: { staffMembers?: CustomerStaff[]; servicePrices?: unknown[] } | null = null;
        if (existing) {
          const detailRes = await fetch(withApiBase(`/api/customers/${encodeURIComponent(existing.id)}`));
          existingProfile = await detailRes.json().catch(() => null);
        }
        const res = await fetch(
          withApiBase(existing ? `/api/customers/${encodeURIComponent(existing.id)}` : "/api/customers"),
          {
            method: existing ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...row,
              staffMembers: existingProfile?.staffMembers ?? row.staffMembers ?? [],
              servicePrices: existingProfile?.servicePrices ?? [],
            }),
          }
        );
        if (res.ok) importedCount += 1;
      }

      setPreviewRows(null);
      await loadCustomers(true);
      toast.success(`导入完成：${importedCount} 条`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "导入失败";
      setActionError(message);
      toast.error(message);
    } finally {
      setImporting(false);
    }
  };

  const deleteRow = async (row: CustomerRow) => {
    if (!window.confirm(`删除客户 “${row.name}”？`)) return;
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(withApiBase(`/api/customers/${encodeURIComponent(row.id)}`), { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "删除失败");
      removeCustomerCaches(row.id);
      await loadCustomers(true);
      toast.success("客户已删除");
    } catch (err) {
      const message = err instanceof Error ? err.message : "删除失败";
      setActionError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 text-[14px]">
      <h1 className="text-2xl font-semibold text-[rgba(0,0,0,0.72)]">客户管理</h1>

      {loadError ? <Alert variant="error" description={loadError} onClose={() => setLoadError(null)} /> : null}
      {actionError ? <Alert variant="error" description={actionError} onClose={() => setActionError(null)} /> : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-[rgba(0,0,0,0.7)]">Customers List</div>
            <div className="ml-2 flex items-center gap-2">
              <button
                className={`h-8 rounded-[10px] px-3 text-sm border ${
                  viewType === "Personal"
                    ? "bg-[rgba(0,0,0,0.06)] border-[rgba(0,0,0,0.12)]"
                    : "bg-white border-[rgba(0,0,0,0.08)]"
                }`}
                onClick={() => {
                  setViewType("Personal");
                  setSearch("");
                }}
                type="button"
              >
                Personal
              </button>
              <button
                className={`h-8 rounded-[10px] px-3 text-sm border ${
                  viewType === "Business"
                    ? "bg-[rgba(0,0,0,0.06)] border-[rgba(0,0,0,0.12)]"
                    : "bg-white border-[rgba(0,0,0,0.08)]"
                }`}
                onClick={() => {
                  setViewType("Business");
                  setSearch("");
                }}
                type="button"
              >
                Business
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Input className="w-[220px]" placeholder="搜索客户..." value={search} onChange={(event) => setSearch(event.target.value)} />
            <Button onClick={downloadTemplate}>Template</Button>

            <input
              id="csv-upload"
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleCsvSelect(file);
                event.target.value = "";
              }}
            />

            <Button onClick={() => document.getElementById("csv-upload")?.click()}>Import CSV</Button>
            <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => navigate(`/customers/new?type=${viewType}`)}>
              Add
            </Button>
          </div>
        </div>

        {previewRows ? (
          <div className="border-b bg-[rgba(0,0,0,0.03)] p-4">
            <div className="mb-2 font-semibold">预览导入数据（{previewRows.length} 条）</div>
            <div className="max-h-60 overflow-auto text-xs">
              {previewRows.map((row, index) => (
                <div key={index} className="grid grid-cols-7 gap-2 border-b py-1">
                  <div>{row.type}</div>
                  <div>{row.name}</div>
                  <div>{row.phone}</div>
                  <div>{row.email}</div>
                  <div>{row.address}</div>
                  <div>{row.businessCode}</div>
                  <div>{row.notes}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="primary" onClick={confirmImport} disabled={importing}>
                {importing ? "Importing..." : "Confirm Import"}
              </Button>
              <Button onClick={() => setPreviewRows(null)}>Cancel</Button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="py-10 text-center text-sm text-[var(--ds-muted)]">加载中...</div>
        ) : filteredRows.length === 0 ? (
          <EmptyState message="暂无客户" />
        ) : (
          <div className="overflow-x-auto">
            <div className={isBusinessView ? "min-w-[1740px]" : "min-w-[1380px]"}>
              <div
                className="grid gap-2 border-b border-[rgba(0,0,0,0.06)] px-4 py-3 text-[12px] font-semibold text-[rgba(0,0,0,0.55)]"
                style={{ gridTemplateColumns: isBusinessView ? businessGridTemplate : personalGridTemplate }}
              >
                <div>ID</div>
                <div>类型</div>
                <div>{isBusinessView ? "公司名称" : "姓名"}</div>
                <div>电话</div>
                <div>Email</div>
                <div>地址</div>
                <div>Business Code</div>
                <div>备注</div>
                {isBusinessView ? <div>商户专员统计数量</div> : null}
                {isBusinessView ? <div>服务价格</div> : null}
                {isBusinessView ? <div>服务的车辆总数</div> : null}
                <div className="text-right pr-2">操作</div>
              </div>

              {filteredRows.map((row, rowIndex) => (
                <div
                  key={row.id}
                  className={`grid gap-2 border-b border-[rgba(0,0,0,0.06)] px-4 py-3 transition ${
                    rowIndex % 2 === 0 ? "bg-[rgba(0,0,0,0.02)]" : "bg-white"
                  } hover:bg-[rgba(59,130,246,0.08)]`}
                  style={{ gridTemplateColumns: isBusinessView ? businessGridTemplate : personalGridTemplate }}
                >
                  <div className="text-xs text-[rgba(0,0,0,0.6)]">{row.id}</div>
                  <div className="truncate">{row.type}</div>
                  <div className="truncate">{row.name}</div>
                  <div className="truncate">{row.phone}</div>
                  <div className="truncate">{row.email}</div>
                  <div className="whitespace-normal break-words">{row.address}</div>
                  <div className="truncate">{row.businessCode}</div>
                  <div className="truncate">{row.notes}</div>
                  {isBusinessView ? <div className="pt-2 text-xs text-[rgba(0,0,0,0.55)]">{row.staffMembers.length}</div> : null}
                  {isBusinessView ? <div className="pt-2 text-xs text-[rgba(0,0,0,0.55)]">{row.servicePriceCount}</div> : null}
                  {isBusinessView ? <div className="pt-2 text-xs text-[rgba(0,0,0,0.55)]">{row.currentYearJobCount}</div> : null}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[rgba(0,0,0,0.5)] hover:text-[rgba(0,0,0,0.75)]"
                      title="Edit"
                      onClick={() => navigate(`/customers/${row.id}`)}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[rgba(239,68,68,0.9)] hover:text-[rgba(239,68,68,1)]"
                      title="Delete"
                      onClick={() => deleteRow(row)}
                      disabled={saving}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
