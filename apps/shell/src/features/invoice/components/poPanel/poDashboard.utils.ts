import type { PoPanelModel } from "../../hooks/useInvoiceDashboardState";

export function getPoRequestSnapshotTotal(model: Pick<PoPanelModel, "subtotal">) {
  return model.subtotal;
}
