import { PoDashboard } from "@/features/invoice/components/poPanel/PoDashboard";
import type { PoPanelModel } from "@/features/invoice/hooks/useInvoiceDashboardState";

type PoPanelProps = {
  model: PoPanelModel;
};

export function PoPanel({ model }: PoPanelProps) {
  return (
    <div className="space-y-3 py-6">
      {model.poPanelLoading ? (
        <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-2 text-xs text-sky-700">
          正在后台同步 Gmail 历史，邮件编辑器已可使用…
        </div>
      ) : null}
      <PoDashboard model={model} />
    </div>
  );
}
