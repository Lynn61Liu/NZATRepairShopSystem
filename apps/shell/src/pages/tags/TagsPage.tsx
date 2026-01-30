import { useEffect, useMemo, useState } from "react";
import { Card, Button, EmptyState, Alert } from "@/components/ui";
import { Plus, Trash2, Pencil } from "lucide-react";

type TagRow = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export function TagsPage() {
  const [rows, setRows] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const canSaveNew = useMemo(() => draftName.trim().length > 0 && !saving, [draftName, saving]);
  const canSaveEdit = useMemo(() => editDraft.trim().length > 0 && !saving, [editDraft, saving]);

  const loadTags = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/tags");
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "加载标签失败");
      }
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      setLoadError(err instanceof Error ? err.message : "加载标签失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTags();
  }, []);

  const startAdd = () => {
    setActionError(null);
    setAdding(true);
    setDraftName("");
    setEditingId(null);
  };

  const cancelAdd = () => {
    setAdding(false);
    setDraftName("");
  };

  const saveNew = async () => {
    if (!canSaveNew) return;
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draftName.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "保存失败");
      }
      setAdding(false);
      setDraftName("");
      await loadTags();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: TagRow) => {
    setActionError(null);
    setEditingId(row.id);
    setEditDraft(row.name);
    setAdding(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const saveEdit = async () => {
    if (!editingId || !canSaveEdit) return;
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/tags/${encodeURIComponent(editingId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editDraft.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "保存失败");
      }
      setEditingId(null);
      setEditDraft("");
      await loadTags();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (row: TagRow) => {
    if (!window.confirm(`删除标签 “${row.name}”？`)) return;
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/tags/${encodeURIComponent(row.id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "删除失败");
      }
      await loadTags();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 text-[14px]">
      <h1 className="text-2xl font-semibold text-[rgba(0,0,0,0.72)]">Tag 管理</h1>

      {loadError ? (
        <Alert variant="error" description={loadError} onClose={() => setLoadError(null)} />
      ) : null}
      {actionError ? (
        <Alert variant="error" description={actionError} onClose={() => setActionError(null)} />
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.06)] px-4 py-3">
          <div className="text-sm font-semibold text-[rgba(0,0,0,0.7)]">Tags List</div>
          <Button variant="primary" leftIcon={<Plus size={16} />} onClick={startAdd}>
            Add
          </Button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-[var(--ds-muted)]">加载中...</div>
        ) : rows.length === 0 && !adding ? (
          <EmptyState message="暂无标签" />
        ) : (
          <div className="divide-y divide-[rgba(0,0,0,0.06)]">
            {adding ? (
              <div className="group flex items-center gap-3 px-4 py-3 hover:bg-[rgba(0,0,0,0.02)]">
                <input
                  className="h-9 w-full rounded-[8px] border border-[var(--ds-border)] px-3"
                  placeholder="输入标签名"
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                />
                <Button variant="primary" onClick={saveNew} disabled={!canSaveNew}>
                  Save
                </Button>
                <Button onClick={cancelAdd} disabled={saving}>
                  Cancel
                </Button>
              </div>
            ) : null}

            {rows.map((row) => {
              const isEditing = editingId === row.id;
              return (
                <div
                  key={row.id}
                  className="group flex items-center gap-3 px-4 py-3 transition hover:bg-[rgba(0,0,0,0.02)]"
                >
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <input
                        className="h-9 w-full rounded-[8px] border border-[var(--ds-border)] px-3"
                        value={editDraft}
                        onChange={(event) => setEditDraft(event.target.value)}
                      />
                    ) : (
                      <div className="truncate text-[rgba(0,0,0,0.72)]">{row.name}</div>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <Button variant="primary" onClick={saveEdit} disabled={!canSaveEdit}>
                        Save
                      </Button>
                      <Button onClick={cancelEdit} disabled={saving}>
                        Cancel
                      </Button>
                    </div>
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
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
