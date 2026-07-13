import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Alert, Button, Card, EmptyState, Input, Select } from "@/components/ui";
import { requestJson } from "@/utils/api";

type QuickJobOption = {
  id: string;
  code: string;
  label: string;
  serviceType: string;
  description: string;
  xeroItemCode?: string | null;
  accountCode?: string | null;
  taxType?: string | null;
  defaultAmountInclGst: number;
  isActive: boolean;
  sortOrder: number;
};

type QuickJobDraft = {
  code: string;
  label: string;
  serviceType: string;
  description: string;
  xeroItemCode: string;
  accountCode: string;
  taxType: string;
  defaultAmountInclGst: string;
  isActive: boolean;
  sortOrder: string;
};

const emptyDraft: QuickJobDraft = {
  code: "",
  label: "",
  serviceType: "mech",
  description: "",
  xeroItemCode: "666WORSHOP Labour Fee",
  accountCode: "",
  taxType: "OUTPUT2",
  defaultAmountInclGst: "",
  isActive: true,
  sortOrder: "100",
};

function optionToDraft(option: QuickJobOption): QuickJobDraft {
  return {
    code: option.code,
    label: option.label,
    serviceType: option.serviceType || "mech",
    description: option.description || "",
    xeroItemCode: option.xeroItemCode || "",
    accountCode: option.accountCode || "",
    taxType: option.taxType || "OUTPUT2",
    defaultAmountInclGst:
      typeof option.defaultAmountInclGst === "number" && !Number.isNaN(option.defaultAmountInclGst)
        ? String(option.defaultAmountInclGst)
        : "",
    isActive: option.isActive,
    sortOrder: String(option.sortOrder ?? 100),
  };
}

function buildPayload(draft: QuickJobDraft) {
  const amount = Number(draft.defaultAmountInclGst || 0);
  const sortOrder = Number(draft.sortOrder || 100);
  return {
    code: draft.code.trim(),
    label: draft.label.trim(),
    serviceType: draft.serviceType,
    description: draft.description.trim(),
    xeroItemCode: draft.xeroItemCode.trim() || null,
    accountCode: draft.accountCode.trim() || null,
    taxType: draft.taxType.trim() || "OUTPUT2",
    defaultAmountInclGst: Number.isFinite(amount) ? amount : 0,
    isActive: draft.isActive,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 100,
  };
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={[
        "relative h-7 w-12 rounded-full transition",
        checked ? "bg-[var(--ds-primary)]" : "bg-[rgba(0,0,0,0.18)]",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      ].join(" ")}
      aria-pressed={checked}
    >
      <span
        className={[
          "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition",
          checked ? "left-6" : "left-1",
        ].join(" ")}
      />
    </button>
  );
}

function serviceTypeLabel(value: string) {
  if (value === "wof") return "WOF";
  if (value === "paint") return "喷漆";
  return "机修";
}

export function EftposQuickJobsPage() {
  const [rows, setRows] = useState<QuickJobOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<QuickJobDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<QuickJobDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadRows = async () => {
      const res = await requestJson<{ options?: QuickJobOption[] }>("/api/paymark-transactions/quick-job-options");
      if (cancelled) return;

      if (!res.ok) {
        setError(res.error || "Failed to load EFTPOS quick job options.");
        setRows([]);
        setLoading(false);
        return;
      }

      setRows(Array.isArray(res.data?.options) ? res.data!.options : []);
      setLoading(false);
    };

    void loadRows();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) =>
      [row.code, row.label, row.serviceType, row.description, row.xeroItemCode, row.accountCode, row.taxType]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [rows, search]);

  const startAdd = () => {
    setAdding(true);
    setDraft(emptyDraft);
    setEditingId(null);
    setEditDraft(null);
    setError("");
  };

  const saveNew = async () => {
    if (!draft.label.trim()) {
      setError("Label is required.");
      return;
    }

    setSaving(true);
    setError("");
    const res = await requestJson<{ option?: QuickJobOption }>("/api/paymark-transactions/quick-job-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(draft)),
    });
    setSaving(false);

    if (!res.ok || !res.data?.option) {
      setError(res.error || "Failed to create quick job option.");
      return;
    }

    setRows((current) => [...current, res.data!.option!].sort((a, b) => a.sortOrder - b.sortOrder));
    setAdding(false);
    setDraft(emptyDraft);
  };

  const startEdit = (row: QuickJobOption) => {
    setAdding(false);
    setEditingId(row.id);
    setEditDraft(optionToDraft(row));
    setError("");
  };

  const saveEdit = async (row: QuickJobOption) => {
    if (!editDraft?.label.trim()) {
      setError("Label is required.");
      return;
    }

    setSaving(true);
    setError("");
    const res = await requestJson<{ option?: QuickJobOption }>(
      `/api/paymark-transactions/quick-job-options/${encodeURIComponent(row.id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(editDraft)),
      }
    );
    setSaving(false);

    if (!res.ok || !res.data?.option) {
      setError(res.error || "Failed to update quick job option.");
      return;
    }

    const next = res.data.option;
    setRows((current) =>
      current.map((item) => (item.id === next.id ? next : item)).sort((a, b) => a.sortOrder - b.sortOrder)
    );
    setEditingId(null);
    setEditDraft(null);
  };

  const deleteRow = async (row: QuickJobOption) => {
    if (!window.confirm(`Delete ${row.label}?`)) return;

    setSaving(true);
    setError("");
    const res = await requestJson<{ success?: boolean }>(
      `/api/paymark-transactions/quick-job-options/${encodeURIComponent(row.id)}`,
      { method: "DELETE" }
    );
    setSaving(false);

    if (!res.ok) {
      setError(res.error || "Failed to delete quick job option.");
      return;
    }

    setRows((current) => current.filter((item) => item.id !== row.id));
  };

  const renderDraftRow = (
    rowDraft: QuickJobDraft,
    onChange: (next: QuickJobDraft) => void,
    actions: React.ReactNode
  ) => (
    <div className="grid grid-cols-[130px_180px_110px_240px_230px_120px_110px_110px_72px_116px] gap-2 px-4 py-3">
      <Input value={rowDraft.code} placeholder="code" onChange={(event) => onChange({ ...rowDraft, code: event.target.value })} />
      <Input value={rowDraft.label} placeholder="Label" onChange={(event) => onChange({ ...rowDraft, label: event.target.value })} />
      <Select value={rowDraft.serviceType} onChange={(event) => onChange({ ...rowDraft, serviceType: event.target.value })}>
        <option value="mech">机修</option>
        <option value="wof">WOF</option>
        <option value="paint">喷漆</option>
      </Select>
      <Input value={rowDraft.description} placeholder="Invoice line" onChange={(event) => onChange({ ...rowDraft, description: event.target.value })} />
      <Input value={rowDraft.xeroItemCode} placeholder="Xero item code" onChange={(event) => onChange({ ...rowDraft, xeroItemCode: event.target.value })} />
      <Input value={rowDraft.accountCode} placeholder="Account" onChange={(event) => onChange({ ...rowDraft, accountCode: event.target.value })} />
      <Input value={rowDraft.taxType} placeholder="Tax" onChange={(event) => onChange({ ...rowDraft, taxType: event.target.value })} />
      <Input
        type="number"
        min="0"
        step="0.01"
        value={rowDraft.defaultAmountInclGst}
        placeholder="0.00"
        onChange={(event) => onChange({ ...rowDraft, defaultAmountInclGst: event.target.value })}
      />
      <div className="flex items-center">
        <Toggle checked={rowDraft.isActive} onChange={(checked) => onChange({ ...rowDraft, isActive: checked })} />
      </div>
      <div className="flex items-center justify-end gap-2">{actions}</div>
    </div>
  );

  return (
    <div className="space-y-4 text-[14px]">
      <div>
        <h1 className="text-2xl font-semibold text-[rgba(0,0,0,0.72)]">EFTPOS Quick Jobs</h1>
      </div>

      {error ? <Alert variant="error" description={error} onClose={() => setError("")} /> : null}

      <Card className="min-h-[calc(100vh-180px)] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-4 py-3">
          <div className="text-sm font-semibold text-[rgba(0,0,0,0.7)]">Quick job options</div>
          <div className="flex items-center gap-2">
            <Input className="w-[240px]" placeholder="Search..." value={search} onChange={(event) => setSearch(event.target.value)} />
            <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={startAdd}>
              添加
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[1420px]">
            <div className="grid grid-cols-[130px_180px_110px_240px_230px_120px_110px_110px_72px_116px] gap-2 border-b border-[rgba(0,0,0,0.06)] bg-[rgba(0,0,0,0.03)] px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] text-[rgba(0,0,0,0.52)]">
              <div>Code</div>
              <div>Label</div>
              <div>Type</div>
              <div>Invoice Line</div>
              <div>Xero Item Code</div>
              <div>Account</div>
              <div>Tax</div>
              <div>Incl. GST</div>
              <div>Active</div>
              <div className="text-right"> </div>
            </div>

            {adding
              ? renderDraftRow(
                  draft,
                  setDraft,
                  <>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-blue-700 hover:bg-blue-50"
                      title="Save"
                      onClick={() => void saveNew()}
                      disabled={saving}
                    >
                      <Save className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-50"
                      title="Cancel"
                      onClick={() => setAdding(false)}
                      disabled={saving}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                )
              : null}

            {loading ? (
              <div className="px-4 py-10 text-center text-sm text-[rgba(0,0,0,0.45)]">Loading...</div>
            ) : filteredRows.length === 0 ? (
              <EmptyState message="No EFTPOS quick job options" />
            ) : (
              filteredRows.map((row, index) => {
                const editing = editingId === row.id && editDraft;
                if (editing) {
                  return (
                    <div key={row.id} className={index % 2 === 0 ? "bg-white" : "bg-[rgba(0,0,0,0.02)]"}>
                      {renderDraftRow(
                        editDraft,
                        setEditDraft,
                        <>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-blue-700 hover:bg-blue-50"
                            title="Save"
                            onClick={() => void saveEdit(row)}
                            disabled={saving}
                          >
                            <Save className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-50"
                            title="Cancel"
                            onClick={() => {
                              setEditingId(null);
                              setEditDraft(null);
                            }}
                            disabled={saving}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={row.id}
                    className={[
                      "grid grid-cols-[130px_180px_110px_240px_230px_120px_110px_110px_72px_116px] gap-2 px-4 py-3 transition hover:bg-[rgba(239,68,68,0.06)]",
                      index % 2 === 0 ? "bg-white" : "bg-[rgba(0,0,0,0.02)]",
                    ].join(" ")}
                  >
                    <div className="font-mono text-xs text-[rgba(0,0,0,0.62)]">{row.code}</div>
                    <div className="font-medium text-[rgba(0,0,0,0.72)]">{row.label}</div>
                    <div>{serviceTypeLabel(row.serviceType)}</div>
                    <div className="truncate">{row.description || "-"}</div>
                    <div className="truncate font-mono text-xs">{row.xeroItemCode || "-"}</div>
                    <div className="font-mono text-xs">{row.accountCode || "-"}</div>
                    <div className="font-mono text-xs">{row.taxType || "-"}</div>
                    <div className="tabular-nums">{row.defaultAmountInclGst?.toFixed?.(2) ?? "0.00"}</div>
                    <div className="flex items-center">
                      <Toggle checked={row.isActive} disabled />
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[rgba(0,0,0,0.5)] hover:text-[rgba(0,0,0,0.75)]"
                        title="Edit"
                        onClick={() => startEdit(row)}
                        disabled={saving}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-red-500 hover:text-red-600"
                        title="Delete"
                        onClick={() => void deleteRow(row)}
                        disabled={saving}
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
      </Card>
    </div>
  );
}
