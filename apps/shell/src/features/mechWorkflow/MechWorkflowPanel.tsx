import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Wrench } from "lucide-react";
import { Button } from "@/components/ui";
import { fetchMechWorkflow, updateMechWorkflow } from "./mechWorkflowApi";
import {
  MECH_WORKFLOW_LABELS,
  MECH_WORKFLOW_ORDER,
  type MechWorkflow,
  type MechWorkflowStatus,
} from "./mechWorkflow";

export function MechWorkflowPanel({ jobId }: { jobId: string }) {
  const [workflow, setWorkflow] = useState<MechWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const res = await fetchMechWorkflow(jobId);
      if (cancelled) return;
      if (res.ok && res.data) setWorkflow(res.data);
      else setError(res.error || "加载机修流程失败");
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [jobId]);

  const changeStatus = async (status: MechWorkflowStatus) => {
    setSaving(true);
    setError(null);
    const res = await updateMechWorkflow(jobId, status);
    if (res.ok && res.data) setWorkflow(res.data);
    else setError(res.error || "更新机修流程失败");
    setSaving(false);
  };

  if (loading) {
    return <div className="mb-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />加载机修流程...</div>;
  }
  if (!workflow) return error ? <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div> : null;

  const currentIndex = MECH_WORKFLOW_ORDER.indexOf(workflow.status);
  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold text-slate-800"><Wrench className="h-5 w-5 text-blue-600" />机修流程</div>
          <div className="mt-1 text-xs text-slate-500">
            {workflow.hasMechService ? "MECH" : ""}{workflow.hasMechService && workflow.hasWofService ? " + " : ""}{workflow.hasWofService ? "WOF" : ""}
            {workflow.partsArrivedAt ? " · 配件已到" : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={workflow.status}
            disabled={saving}
            onChange={(event) => void changeStatus(event.target.value as MechWorkflowStatus)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500"
          >
            {MECH_WORKFLOW_ORDER.map((status) => <option key={status} value={status}>{MECH_WORKFLOW_LABELS[status]}</option>)}
          </select>
          {saving ? <Button disabled leftIcon={<Loader2 className="h-4 w-4 animate-spin" />}>保存中</Button> : null}
        </div>
      </div>
      <div className="mt-5 grid gap-2 md:grid-cols-4 xl:grid-cols-8">
        {MECH_WORKFLOW_ORDER.map((status, index) => {
          const active = status === workflow.status;
          const complete = status !== "on_hold" && currentIndex >= 0 && index < currentIndex && workflow.status !== "on_hold";
          return (
            <div key={status} className={`rounded-xl border px-3 py-3 text-xs font-semibold ${active ? "border-blue-500 bg-blue-50 text-blue-700" : complete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-400"}`}>
              <div className="mb-1">{complete ? <CheckCircle2 className="h-4 w-4" /> : <span>{index + 1}</span>}</div>
              {MECH_WORKFLOW_LABELS[status]}
            </div>
          );
        })}
      </div>
      {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
    </section>
  );
}
