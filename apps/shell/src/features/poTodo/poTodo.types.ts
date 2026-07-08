export type PoTodoTab = "pendingSend" | "awaitingPo" | "invoiced";

export type PoTodoRow = {
  jobId: number;
  createdAt: string;
  code: string;
  plate: string;
  model: string;
  notes: string;
  reference?: string | null;
  xeroInvoiceId?: string | null;
  status: string;
  sentSource?: string | null;
  manuallyMarkedSentAt?: string | null;
  firstRequestSentAt?: string | null;
  lastRequestSentAt?: string | null;
  lastFollowUpSentAt?: string | null;
  lastSupplierReplyAt?: string | null;
  detectedPoNumber?: string | null;
  confirmedPoNumber?: string | null;
  gmailDraftId?: string | null;
  gmailDraftUpdatedAt?: string | null;
  gmailThreadId?: string | null;
  correlationId: string;
};

export type PoTodoListResponse = {
  total: number;
  items: PoTodoRow[];
};

export type PoTodoSyncResponse = {
  checkedJobs: number;
  syncedMessages: number;
  warnings: string[];
};

export type PoTodoActionResponse = {
  success: boolean;
  error?: string | null;
};

export type PoTodoStepResult = {
  status: "pending" | "running" | "success" | "failed" | string;
  message: string;
};

export type ConfirmPoResponse = {
  success: boolean;
  jobId: number;
  poNumber: string;
  invoiceReference: string;
  steps: Record<string, PoTodoStepResult>;
};

export type CompletePoResponse = {
  updated: number;
  skipped: number;
};

export type PoDraftPreview = {
  jobId: number;
  to: string;
  subject: string;
  htmlBody: string;
  gmailDraftId?: string | null;
};
