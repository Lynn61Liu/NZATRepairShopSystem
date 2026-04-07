import { PoDashboard } from "@/features/invoice/components/poPanel/PoDashboard";
import type { PoPanelModel } from "@/features/invoice/hooks/useInvoiceDashboardState";

type PoPanelProps = {
  model: PoPanelModel;
};

export function PoPanel({ model }: PoPanelProps) {
  if (model.poPanelLoading) {
    return (
      <div className="py-6">
        <div className="rounded-[18px] border border-slate-200 bg-white p-6">
          <div className="space-y-4 animate-pulse">
            <div className="h-8 w-40 rounded bg-slate-200" />
            <div className="h-14 rounded-2xl bg-slate-100" />
            <div className="h-64 rounded-2xl bg-slate-100" />
            <div className="h-44 rounded-2xl bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <PoDashboard model={model} />
    </div>
  );
}
