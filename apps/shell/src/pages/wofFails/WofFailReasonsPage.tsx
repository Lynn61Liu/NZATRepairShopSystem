import { useEffect, useMemo, useState } from "react";
import { Card, Button, EmptyState, Alert, Input } from "@/components/ui";
import { Plus, Trash2, Pencil } from "lucide-react";

type FailReasonRow = {
  id: string;
  label: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type FailReasonDraft = Omit<FailReasonRow, "id" | "createdAt" | "updatedAt">;

const blankDraft: FailReasonDraft = {
  label: "",
  isActive: true,
};

export function WofFailReasonsPage() {
  const [rows, setRows] = useState<FailReasonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<FailReasonDraft>(blankDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<FailReasonDraft>(blankDraft);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const filteredRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((row) => row.label.toLowerCase().includes(s));
  }, [rows, search]);

  const loadReasons = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/wof-fail-reasons");
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "加载失败原因失败");
      }
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      setLoadError(err instanceof Error ? err.message : "加载失败原因失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReasons();
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
    if (!draft.label.trim() || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch("/api/wof-fail-reasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: draft.label.trim(), isActive: draft.isActive }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "保存失败");
      }
      setAdding(false);
      setDraft(blankDraft);
      await loadReasons();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: FailReasonRow) => {
    setActionError(null);
    setEditingId(row.id);
    setEditDraft({ label: row.label, isActive: row.isActive });
    setAdding(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(blankDraft);
  };

  const saveEdit = async () => {
    if (!editingId || !editDraft.label.trim() || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/wof-fail-reasons/${encodeURIComponent(editingId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editDraft.label.trim(), isActive: editDraft.isActive }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "保存失败");
      }
      setEditingId(null);
      setEditDraft(blankDraft);
      await loadReasons();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (row: FailReasonRow) => {
    if (!window.confirm(`删除失败原因 “${row.label}”？`)) return;
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/wof-fail-reasons/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "删除失败");
      }
      await loadReasons();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setSaving(false);
    }
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
      <h1 className="text-2xl font-semibold text-[rgba(0,0,0,0.72)]">WOF 失败原因管理</h1>

      {loadError ? (
        <Alert variant="error" description={loadError} onClose={() => setLoadError(null)} />
      ) : null}
      {actionError ? (
        <Alert variant="error" description={actionError} onClose={() => setActionError(null)} />
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-4 py-3">
          <div className="text-sm font-semibold text-[rgba(0,0,0,0.7)]">WOF Fail Reasons</div>
          <div className="flex items-center gap-2">
            <Input
              className="w-[220px]"
              placeholder="搜索失败原因..."
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
          <EmptyState message="暂无失败原因" />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[120px_1fr_120px_140px] gap-2 border-b border-[rgba(0,0,0,0.06)] px-4 py-3 text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">
                <div>ID</div>
                <div>原因</div>
                <div>Active</div>
                <div className="text-right pr-2">操作</div>
              </div>

              {adding ? (
                <div className="grid grid-cols-[120px_1fr_120px_140px] gap-2 px-4 py-3 hover:bg-[rgba(0,0,0,0.02)]">
                  <div className="text-xs text-[rgba(0,0,0,0.5)]">-</div>
                  <Input
                    value={draft.label}
                    onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
                  />
                  <div>
                    <Toggle
                      checked={draft.isActive}
                      onChange={(next) => setDraft((prev) => ({ ...prev, isActive: next }))}
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="primary" onClick={saveNew} disabled={!draft.label.trim() || saving}>
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
                    className="group grid grid-cols-[120px_1fr_120px_140px] gap-2 px-4 py-3 transition hover:bg-[rgba(0,0,0,0.02)]"
                  >
                    <div className="text-xs text-[rgba(0,0,0,0.6)]">{row.id}</div>
                    <div>
                      {isEditing ? (
                        <Input
                          value={editDraft.label}
                          onChange={(event) => setEditDraft((prev) => ({ ...prev, label: event.target.value }))}
                        />
                      ) : (
                        <div className="truncate">{row.label}</div>
                      )}
                    </div>
                    <div>
                      <Toggle
                        checked={isEditing ? editDraft.isActive : row.isActive}
                        onChange={
                          isEditing
                            ? (next) => setEditDraft((prev) => ({ ...prev, isActive: next }))
                            : undefined
                        }
                        disabled={!isEditing}
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      {isEditing ? (
                        <>
                          <Button variant="primary" onClick={saveEdit} disabled={!editDraft.label.trim() || saving}>
                            Save
                          </Button>
                          <Button onClick={cancelEdit} disabled={saving}>
                            Cancel
                          </Button>
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
