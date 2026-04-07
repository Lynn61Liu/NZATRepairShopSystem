export type InvoiceStatus =
  | "Draft"
  | "Awaiting PO"
  | "PO Received"
  | "Awaiting Payment"
  | "Paid";

export type XeroInvoiceStatus = "DRAFT" | "AUTHORISED" | "PAID" | "UNKNOWN";
export type XeroStateOption = "DRAFT" | "AUTHORISED" | "PAID_CASH" | "PAID_EPOST" | "PAID_BANK_TRANSFER";

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
  xeroTaxType?: string;
  xeroTaxAmount?: number;
  xeroLineAmount?: number;
};

export type EmailState = "Draft" | "Email Sent" | "Get Reply" | "Reminder Scheduled" | "Get PO";

export type EmailTimelineEventType =
  | "sent"
  | "reminder"
  | "reply"
  | "detected"
  | "confirmed"
  | "updated";

export type EmailAttachment = {
  fileName: string;
  mimeType: string;
  size?: number;
  attachmentId?: string;
  cachedRelativePath?: string;
  cachedAtUtc?: string;
};

export type EmailTimelineEvent = {
  id: string;
  type: EmailTimelineEventType;
  timestamp: string;
  description: string;
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
  threadId?: string;
  unread?: boolean;
  detectedPoNumber?: string;
  rfcMessageId?: string;
  referencesHeader?: string;
  attachments?: EmailAttachment[];
  isSystemInitiated?: boolean;
};

export type PoSource = "email" | "pdf" | "image" | "ocr";

export type PoDetection = {
  id: string;
  poNumber: string;
  source: PoSource;
  confidence: number;
  evidencePreview: string;
  previewLabel: string;
  previewType: "pdf" | "image" | "text";
  gmailMessageId?: string;
  attachmentFileName?: string;
  attachmentId?: string;
  attachmentMimeType?: string;
  status: "pending" | "confirmed" | "rejected";
};

export type GmailThreadPayload = {
  events: EmailTimelineEvent[];
  unreadReplyCount: number;
  hasReply: boolean;
  hasPo: boolean;
  detectedPoNumber: string;
  lastReplyTimestamp: string;
  syncWarning: string;
  detections: PoDetection[];
  hasExternalDraftSend: boolean;
};

export type WorkflowStep = {
  id: number;
  title: string;
  description: string;
};

export type ReferencePreviewSource = {
  kind: "po-detection";
  poNumber: string;
  label: string;
  previewType: "pdf" | "image" | "text";
  gmailMessageId?: string;
  attachmentFileName?: string;
  attachmentId?: string;
  attachmentMimeType?: string;
  body?: string;
};

export type MerchantEmailRecipient = {
  email: string;
  kind: "business" | "staff";
  name: string;
  title: string;
};

export type InvoiceDashboardState = {
  // year: string;
  contact: string;
  merchantUserName: string;
  issueDate: string;
  dueDate: string;
  invoiceNumber: string;
  reference: string;
  invoiceNote: string;
  amountsAre: AmountsAre;
  xeroInvoiceId: string;
  status: InvoiceStatus;
  xeroStatus: XeroInvoiceStatus;
  lastSyncTime: string;
  lastSyncDirection: SyncDirection;
  synced: boolean;
  merchantEmails: string[];
  merchantEmailRecipients: MerchantEmailRecipient[];
  selectedMerchantEmail: string;
  correlationId: string;
  vehicleRego: string;
  vehicleModel: string;
  vehicleMake: string;
  vehicleYear: string;
  snapshotTotal: number;
  emailStates: EmailState[];
  remindersSent: number;
  reminderLimit: number;
  lastEmailSent: string;
  lastReplyReceived: string;
  nextReminderIn: string;
  currentWorkflowStep: number;
  latestPaymentMethod?: string;
  latestPaymentReference?: string;
};
