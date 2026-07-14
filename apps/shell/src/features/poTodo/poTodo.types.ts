export type PoTodoTab = "pendingSend" | "awaitingPo" | "invoiced";

export type PoTodoRow = {
  jobId: number;
  createdAt: string;
  customerId?: number | null;
  customerName: string;
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
  pendingPoNumber?: string | null;
  confirmationStatus?: string | null;
  confirmationNote?: string | null;
  confirmationLastAttemptAt?: string | null;
  xeroSubtotal?: number | null;
};

export type PoTodoListResponse = {
  total: number;
  items: PoTodoRow[];
  currentPage: number;
  pageSize: number;
  totalPages: number;
  lastGmailSyncedAt?: string | null;
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

export type ConfirmPoBatchResponse = {
  total: number;
  succeeded: number;
  failed: number;
  results: ConfirmPoResponse[];
};

export type PoXeroSummary = {
  jobId: number;
  subtotal?: number | null;
  status?: string | null;
  reference?: string | null;
  refreshedAt: string;
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
