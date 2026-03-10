export type InvoiceStatus =
  | "Draft"
  | "Awaiting PO"
  | "PO Received"
  | "Awaiting Payment"
  | "Authorised";

export type AmountsAre = "Tax Exclusive" | "Tax Inclusive" | "No Tax";

export type SyncDirection = "System -> Xero" | "Xero -> System";

export type TaxRateOption =
  | "15% GST on Expenses"
  | "15% GST on Income"
  | "GST on Imports"
  | "No GST"
  | "Zero Rated"
  | "Zero Rated - Exp";

export type XeroItemDefinition = {
  code: string;
  name: string;
  unitPrice: number;
  account: string;
  taxRate: TaxRateOption;
};

export type InvoiceItem = {
  id: string;
  itemCode: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  account: string;
  taxRate: TaxRateOption;
};

export type EmailState = "Email Sent" | "Waiting for Reply" | "Reminder Scheduled";

export type EmailTimelineEventType =
  | "sent"
  | "reminder"
  | "reply"
  | "detected"
  | "confirmed"
  | "updated";

export type EmailTimelineEvent = {
  id: string;
  type: EmailTimelineEventType;
  timestamp: string;
  description: string;
};

export type PoSource = "email" | "pdf" | "ocr";

export type PoDetection = {
  id: string;
  poNumber: string;
  source: PoSource;
  confidence: number;
  evidencePreview: string;
  previewLabel: string;
  previewType: "pdf" | "image";
  status: "pending" | "confirmed" | "rejected";
};

export type WorkflowStep = {
  id: number;
  title: string;
  description: string;
};

export type InvoiceDashboardState = {
  contact: string;
  issueDate: string;
  dueDate: string;
  invoiceNumber: string;
  reference: string;
  amountsAre: AmountsAre;
  xeroInvoiceId: string;
  status: InvoiceStatus;
  lastSyncTime: string;
  lastSyncDirection: SyncDirection;
  synced: boolean;
  merchantEmail: string;
  correlationId: string;
  snapshotTotal: number;
  emailStates: EmailState[];
  remindersSent: number;
  reminderLimit: number;
  lastEmailSent: string;
  lastReplyReceived: string;
  nextReminderIn: string;
  currentWorkflowStep: number;
};
