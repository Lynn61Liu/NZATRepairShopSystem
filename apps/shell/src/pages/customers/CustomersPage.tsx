import { useEffect, useMemo, useState } from "react";
import { Card, Button, EmptyState, Alert, Input } from "@/components/ui";
import { withApiBase } from "@/utils/api";
import { Plus, Trash2, Pencil } from "lucide-react";

type CustomerRow = {
  id: string;
  type: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  businessCode: string;
  notes: string;
};

type CustomerDraft = Omit<CustomerRow, "id">;

const blankDraft: CustomerDraft = {
  type: "Personal",
  name: "",
  phone: "",
  email: "",
  address: "",
  businessCode: "",
  notes: "",
};

export function CustomersPage() {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<CustomerDraft>(blankDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<CustomerDraft>(blankDraft);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [previewRows, setPreviewRows] = useState<CustomerDraft[] | null>(null);
  const [importing, setImporting] = useState(false);

  // 新增：页面视图切换（Personal / Business）
  const [viewType, setViewType] = useState<"Personal" | "Business">("Personal");

  const filteredRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    const base = rows.filter((r) => (r.type || "").toLowerCase() === viewType.toLowerCase());

    if (!s) return base;

    return base.filter((row) => {
      const hay = [
        row.id,
        row.type,
        row.name,
        row.phone,
        row.email,
        row.address,
        row.businessCode,
        row.notes,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [rows, search, viewType]);

  const loadCustomers = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(withApiBase("/api/customers"));
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "加载客户失败");
      }
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      setLoadError(err instanceof Error ? err.message : "加载客户失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  // CSV 输出时的标准转义：包含逗号/引号/换行 -> 必须用引号包起来，内部引号用 "" 表示
  const csvEscape = (v: string) => {
    const s = (v ?? "").toString();
    if (/[",\r\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const downloadTemplate = () => {
    const header = "type,name,phone,email,address,businessCode,notes";
    const row1 = [
      "Personal",
      "John Doe",
      "021000000",
      "john@email.com",
      '12 Queen St, Auckland', // 故意带逗号演示正确 CSV
      "",
      "VIP",
    ]
      .map(csvEscape)
      .join(",");

    const row2 = [
      "Business",
      "ABC Motors",
      "093333333",
      "info@abc.co.nz",
      '44 Mount Rd, Auckland',
      "ABC123",
      "Dealer",
    ]
      .map(csvEscape)
      .join(",");

    const csv = `${header}\n${row1}\n${row2}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "customer_import_template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  // 标准 CSV 解析（支持：引号字段、字段内逗号、"" 代表引号、CRLF/LF）
  const parseCsv = (text: string): CustomerDraft[] => {
    const input = text.replace(/\uFEFF/g, ""); // 去掉 BOM
    const rowsOut: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;

    const pushField = () => {
      row.push(field);
      field = "";
    };
    const pushRow = () => {
      // 避免把纯空行当数据行
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
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          pushField();
        } else if (ch === "\r") {
          const next = input[i + 1];
          if (next === "\n") i++;
          pushField();
          pushRow();
        } else if (ch === "\n") {
          pushField();
          pushRow();
        } else {
          field += ch;
        }
      }
    }

    // last field/row
    pushField();
    pushRow();

    if (rowsOut.length < 2) throw new Error("CSV 文件为空或只有表头");

    const headers = rowsOut[0].map((h) => (h ?? "").trim().toLowerCase());

    const get = (obj: Record<string, string>, key: string) => (obj[key] ?? "").toString();

    return rowsOut.slice(1).map((values) => {
      const rowObj: Record<string, string> = {};
      headers.forEach((header, index) => {
        rowObj[header] = (values[index] ?? "").trim();
      });

      // 兼容 businessCode / businesscode
      const bc =
        get(rowObj, "businesscode") ||
        get(rowObj, "business_code") ||
        get(rowObj, "businesscode ") ||
        "";

      return {
        type: get(rowObj, "type") || "Personal",
        name: get(rowObj, "name") || "",
        phone: get(rowObj, "phone") || "",
        email: get(rowObj, "email") || "",
        address: get(rowObj, "address") || "",
        businessCode: bc,
        notes: get(rowObj, "notes") || "",
      };
    });
  };

  const handleCsvSelect = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    setPreviewRows(parsed);
  };

  const confirmImport = async () => {
    if (!previewRows) return;
    setImporting(true);
    setActionError(null);

    try {
      for (const draftRow of previewRows) {
        if (!draftRow.name.trim()) continue;

        const existing = rows.find(
          (r) =>
            r.name === draftRow.name &&
            (r.phone === draftRow.phone || r.email === draftRow.email)
        );

        if (existing) {
          await fetch(withApiBase(`/api/customers/${encodeURIComponent(existing.id)}`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...existing,
              ...draftRow,
            }),
          });
        } else {
          await fetch(withApiBase("/api/customers"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(draftRow),
          });
        }
      }

      setPreviewRows(null);
      await loadCustomers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "导入失败");
    } finally {
      setImporting(false);
    }
  };

  const startAdd = () => {
    setActionError(null);
    setAdding(true);
    // 默认新增类型跟随当前 tab（更符合直觉）
    setDraft({ ...blankDraft, type: viewType });
    setEditingId(null);
  };

  const cancelAdd = () => {
    setAdding(false);
    setDraft(blankDraft);
  };

  const saveNew = async () => {
    if (!draft.name.trim() || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(withApiBase("/api/customers"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "保存失败");
      }
      setAdding(false);
      setDraft(blankDraft);
      await loadCustomers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: CustomerRow) => {
    setActionError(null);
    setEditingId(row.id);
    setEditDraft({
      type: row.type,
      name: row.name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      businessCode: row.businessCode,
      notes: row.notes,
    });
    setAdding(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(blankDraft);
  };

  const saveEdit = async () => {
    if (!editingId || !editDraft.name.trim() || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(withApiBase(`/api/customers/${encodeURIComponent(editingId)}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDraft),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "保存失败");
      }
      setEditingId(null);
      setEditDraft(blankDraft);
      await loadCustomers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (row: CustomerRow) => {
    if (!window.confirm(`删除客户 “${row.name}”？`)) return;
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(withApiBase(`/api/customers/${encodeURIComponent(row.id)}`), { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "删除失败");
      }
      await loadCustomers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 text-[14px]">
      <h1 className="text-2xl font-semibold text-[rgba(0,0,0,0.72)]">客户管理</h1>

      {loadError ? (
        <Alert variant="error" description={loadError} onClose={() => setLoadError(null)} />
      ) : null}
      {actionError ? (
        <Alert variant="error" description={actionError} onClose={() => setActionError(null)} />
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-[rgba(0,0,0,0.7)]">Customers List</div>

            {/* 新增：Personal / Business 切换 */}
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
                  setAdding(false);
                  setEditingId(null);
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
                  setAdding(false);
                  setEditingId(null);
                }}
                type="button"
              >
                Business
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Input
              className="w-[220px]"
              placeholder="搜索客户..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button onClick={downloadTemplate}>
              Template
            </Button>

            <input
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              id="csv-upload"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCsvSelect(file);
                e.target.value = "";
              }}
            />

            <Button onClick={() => document.getElementById("csv-upload")?.click()}>
              Import CSV
            </Button>

            <Button variant="primary" leftIcon={<Plus size={16} />} onClick={startAdd}>
              Add
            </Button>
          </div>
        </div>

        {previewRows && (
          <div className="border-b bg-[rgba(0,0,0,0.03)] p-4">
            <div className="font-semibold mb-2">
              预览导入数据（{previewRows.length} 条）
            </div>

            <div className="text-xs max-h-60 overflow-auto">
              {previewRows.map((r, i) => (
                <div key={i} className="grid grid-cols-7 gap-2 border-b py-1">
                  <div>{r.type}</div>
                  <div>{r.name}</div>
                  <div>{r.phone}</div>
                  <div>{r.email}</div>
                  <div>{r.address}</div>
                  <div>{r.businessCode}</div>
                  <div>{r.notes}</div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <Button variant="primary" onClick={confirmImport} disabled={importing}>
                {importing ? "Importing..." : "Confirm Import"}
              </Button>
              <Button onClick={() => setPreviewRows(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-10 text-center text-sm text-[var(--ds-muted)]">加载中...</div>
        ) : filteredRows.length === 0 && !adding ? (
          <EmptyState message="暂无客户" />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1200px]">
              <div className="grid grid-cols-9 gap-2 border-b border-[rgba(0,0,0,0.06)] px-4 py-3 text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">
                <div>ID</div>
                <div>类型</div>
                <div>Name</div>
                <div>电话</div>
                <div>Email</div>
                <div>地址</div>
                <div>Business Code</div>
                <div>备注</div>
                <div className="text-right pr-2">操作</div>
              </div>

              {adding ? (
                <div className="grid grid-cols-9 gap-2 px-4 py-3 hover:bg-[rgba(0,0,0,0.02)]">
                  <div className="text-xs text-[rgba(0,0,0,0.5)]">-</div>
                  <div>
                    <select
                      className="h-9 w-full rounded-[8px] border border-[var(--ds-border)] px-2 text-sm"
                      value={draft.type}
                      onChange={(event) => setDraft((prev) => ({ ...prev, type: event.target.value }))}
                    >
                      <option value="Personal">Personal</option>
                      <option value="Business">Business</option>
                    </select>
                  </div>
                  <Input
                    value={draft.name}
                    onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                  />
                  <Input
                    value={draft.phone}
                    onChange={(event) => setDraft((prev) => ({ ...prev, phone: event.target.value }))}
                  />
                  <Input
                    value={draft.email}
                    onChange={(event) => setDraft((prev) => ({ ...prev, email: event.target.value }))}
                  />
                  <Input
                    value={draft.address}
                    onChange={(event) => setDraft((prev) => ({ ...prev, address: event.target.value }))}
                  />
                  <Input
                    value={draft.businessCode}
                    onChange={(event) => setDraft((prev) => ({ ...prev, businessCode: event.target.value }))}
                  />
                  <Input
                    value={draft.notes}
                    onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="primary" onClick={saveNew} disabled={!draft.name.trim() || saving}>
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
                return (
                  <div
                    key={row.id}
                    className="group grid grid-cols-9 gap-2 px-4 py-3 transition hover:bg-[rgba(0,0,0,0.02)]"
                  >
                    <div className="text-xs text-[rgba(0,0,0,0.6)]">{row.id}</div>
                    <div>
                      {isEditing ? (
                        <select
                          className="h-9 w-full rounded-[8px] border border-[var(--ds-border)] px-2 text-sm"
                          value={editDraft.type}
                          onChange={(event) => setEditDraft((prev) => ({ ...prev, type: event.target.value }))}
                        >
                          <option value="Personal">Personal</option>
                          <option value="Business">Business</option>
                        </select>
                      ) : (
                        <div className="truncate">{row.type}</div>
                      )}
                    </div>
                    <div>
                      {isEditing ? (
                        <Input
                          value={editDraft.name}
                          onChange={(event) => setEditDraft((prev) => ({ ...prev, name: event.target.value }))}
                        />
                      ) : (
                        <div className="truncate">{row.name}</div>
                      )}
                    </div>
                    <div>
                      {isEditing ? (
                        <Input
                          value={editDraft.phone}
                          onChange={(event) => setEditDraft((prev) => ({ ...prev, phone: event.target.value }))}
                        />
                      ) : (
                        <div className="truncate">{row.phone}</div>
                      )}
                    </div>
                    <div>
                      {isEditing ? (
                        <Input
                          value={editDraft.email}
                          onChange={(event) => setEditDraft((prev) => ({ ...prev, email: event.target.value }))}
                        />
                      ) : (
                        <div className="truncate">{row.email}</div>
                      )}
                    </div>
                    <div>
                      {isEditing ? (
                        <Input
                          value={editDraft.address}
                          onChange={(event) => setEditDraft((prev) => ({ ...prev, address: event.target.value }))}
                        />
                      ) : (
                        <div className="whitespace-normal break-words">{row.address}</div>
                      )}
                    </div>
                    <div>
                      {isEditing ? (
                        <Input
                          value={editDraft.businessCode}
                          onChange={(event) => setEditDraft((prev) => ({ ...prev, businessCode: event.target.value }))}
                        />
                      ) : (
                        <div className="truncate">{row.businessCode}</div>
                      )}
                    </div>
                    <div>
                      {isEditing ? (
                        <Input
                          value={editDraft.notes}
                          onChange={(event) => setEditDraft((prev) => ({ ...prev, notes: event.target.value }))}
                        />
                      ) : (
                        <div className="truncate">{row.notes}</div>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      {isEditing ? (
                        <>
                          <Button variant="primary" onClick={saveEdit} disabled={!editDraft.name.trim() || saving}>
                            Save
                          </Button>
                          <Button onClick={cancelEdit} disabled={saving}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <div className="flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
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
                            onClick={() => deleteRow(row)}
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
      </Card>
    </div>
  );
}
