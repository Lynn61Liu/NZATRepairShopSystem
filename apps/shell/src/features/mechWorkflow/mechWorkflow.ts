export type MechWorkflowStatus =
  | "on_hold"
  | "waiting_parts"
  | "parts_transit"
  | "waiting_repair"
  | "repair_completed"
  | "wof_queue"
  | "ready_pickup"
  | "delivered";

export const MECH_WORKFLOW_ORDER: MechWorkflowStatus[] = [
  "on_hold",
  "waiting_parts",
  "parts_transit",
  "waiting_repair",
  "repair_completed",
  "wof_queue",
  "ready_pickup",
  "delivered",
];

export const MECH_WORKFLOW_LABELS: Record<MechWorkflowStatus, string> = {
  on_hold: "On Hold",
  waiting_parts: "等配件",
  parts_transit: "配件待取/在途",
  waiting_repair: "等待处理",
  repair_completed: "修理/检查完成",
  wof_queue: "WOF排队",
  ready_pickup: "可以取车",
  delivered: "交车完毕",
};

export type MechWorkflow = {
  jobId: string;
  status: MechWorkflowStatus;
  partsArrivedAt?: string | null;
  hasWofService: boolean;
  hasMechService: boolean;
  updatedAt?: string;
};

export type MechBoardJob = {
  id: string;
  createdAt: string;
  plate: string;
  customerCode?: string;
  year?: number | null;
  make?: string;
  model?: string;
  urgent?: boolean;
  status: MechWorkflowStatus;
  partsArrivedAt?: string | null;
  hasWofService: boolean;
  hasMechService: boolean;
  wofStatus?: "Todo" | "Checked" | "Recorded" | null;
  workItems: string[];
  notes?: string;
  parts: {
    total: number;
    completed: number;
    allArrived: boolean;
    descriptions: string[];
  };
  lightBindingId?: number | null;
  updatedAt?: string;
};

export const getMechJobTypeLabel = (job: Pick<MechBoardJob, "hasMechService" | "hasWofService">) => {
  if (job.hasMechService && job.hasWofService) return "MECH + WOF";
  return job.hasWofService ? "WOF" : "MECH";
};
