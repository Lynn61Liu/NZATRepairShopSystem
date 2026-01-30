import { useEffect, useMemo, useState } from "react";
import { Card, Button, EmptyState, Alert, Input } from "@/components/ui";
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

  const filteredRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((row) => {
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
  }, [rows, search]);

  const loadCustomers = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/customers");
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

  const startAdd = () => {
    setActionError(null);
    setAdding(true);
    setDraft(blankDraft);
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
      const res = await fetch("/api/customers", {
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
      const res = await fetch(`/api/customers/${encodeURIComponent(editingId)}`, {
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
      const res = await fetch(`/api/customers/${encodeURIComponent(row.id)}`, { method: "DELETE" });
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
          <div className="text-sm font-semibold text-[rgba(0,0,0,0.7)]">Customers List</div>
          <div className="flex items-center gap-2">
            <Input
              className="w-[220px]"
              placeholder="搜索客户..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button variant="primary" leftIcon={<Plus size={16} />} onClick={startAdd}>
              Add
            </Button>
          </div>
        </div>

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
                <div>姓名</div>
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
                        <div className="truncate">{row.address}</div>
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
