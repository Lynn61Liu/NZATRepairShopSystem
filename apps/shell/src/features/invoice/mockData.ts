import type {
  EmailTimelineEvent,
  InvoiceDashboardState,
  InvoiceItem,
  PoDetection,
  WorkflowStep,
  XeroItemDefinition,
} from "./types";

export const invoiceWorkflowSteps: WorkflowStep[] = [
  { id: 1, title: "Draft Created", description: "Invoice draft initialized" },
  { id: 2, title: "Synced", description: "Synced with Xero" },
  { id: 3, title: "PO Requested", description: "Email sent to supplier" },
  { id: 4, title: "Waiting Reply", description: "Awaiting supplier response" },
  { id: 5, title: "PO Extracted", description: "PO number detected" },
  { id: 6, title: "PO Confirmed", description: "PO verified and approved" },
  { id: 7, title: "Reference Updated", description: "Updated in Xero" },
  { id: 8, title: "Authorised", description: "Invoice approved" },
  { id: 9, title: "Awaiting Payment", description: "Pending payment" },
];

export const initialInvoiceState: InvoiceDashboardState = {
  contact: "Auto Parts Wholesale Ltd",
  merchantUserName: "Sam",
  issueDate: "2026-03-05",
  dueDate: "2026-04-04",
  invoiceNumber: "INV-2026-0342",
  reference: "PO-2024-8765 / Job J000342",
  amountsAre: "Tax Exclusive",
  xeroInvoiceId: "8d2eaa6f-98f9-4c9e-a4aa-5a2d9032bf10",
  status: "Awaiting PO",
  lastSyncTime: "2026-03-05 14:23:15",
  lastSyncDirection: "Xero -> System",
  synced: false,
  merchantEmails: ["supplier@autoparts.com", "orders@autoparts.com", "ap@autoparts.com"],
  selectedMerchantEmail: "supplier@autoparts.com",
  correlationId: "CORR-2024-0342-XYZ",
  vehicleRego: "ABC123",
  vehicleModel: "Corolla",
  vehicleMake: "Toyota",
  snapshotTotal: 3845.5,
  emailStates: ["Draft"],
  remindersSent: 1,
  reminderLimit: 3,
  lastEmailSent: "2026-03-05 10:30 AM",
  lastReplyReceived: "No reply yet",
  nextReminderIn: "NaNh NaNm",
  currentWorkflowStep: 5,
};


export const initialItemCatalog: XeroItemDefinition[] = [
  { code: "LAB-001", name: "Engine Oil Change - Premium Synthetic", unitPrice: 89.99, account: "200 - Sales", taxRate: "15% GST on Income" },
  { code: "PRT-145", name: "Brake Pad Replacement - Front Axle", unitPrice: 245, account: "200 - Sales", taxRate: "15% GST on Income" },
  { code: "LAB-210", name: "Tire Rotation & Balancing Service", unitPrice: 35, account: "200 - Sales", taxRate: "15% GST on Income" },
  { code: "PRT-330", name: "Air Filter Replacement", unitPrice: 45, account: "200 - Sales", taxRate: "15% GST on Income" },
  { code: "PRT-510", name: "Cabin Filter Replacement", unitPrice: 58, account: "200 - Sales", taxRate: "15% GST on Income" },
];

export const initialInvoiceItems: InvoiceItem[] = [
  {
    id: "line-1",
    itemCode: "LAB-001",
    description: "Engine Oil Change - Premium Synthetic",
    quantity: 2,
    unitPrice: 89.99,
    discount: 0,
    account: "200 - Sales",
    taxRate: "15% GST on Income",
  },
  {
    id: "line-2",
    itemCode: "PRT-145",
    description: "Brake Pad Replacement - Front Axle",
    quantity: 1,
    unitPrice: 245,
    discount: 5,
    account: "200 - Sales",
    taxRate: "15% GST on Income",
  },
  {
    id: "line-3",
    itemCode: "LAB-210",
    description: "Tire Rotation & Balancing Service",
    quantity: 4,
    unitPrice: 35,
    discount: 0,
    account: "200 - Sales",
    taxRate: "15% GST on Income",
  },
  {
    id: "line-4",
    itemCode: "PRT-330",
    description: "Air Filter Replacement",
    quantity: 1,
    unitPrice: 45,
    discount: 0,
    account: "200 - Sales",
    taxRate: "15% GST on Income",
  },
];

export const initialEmailTimeline: EmailTimelineEvent[] = [
  {
    id: "evt-1",
    type: "sent",
    timestamp: "2026-03-05 10:30 AM",
    description: "PO request email sent to supplier@autoparts.com",
  },
  {
    id: "evt-2",
    type: "reminder",
    timestamp: "2026-03-05 02:15 PM",
    description: "Reminder email sent - No response received",
  },
  {
    id: "evt-3",
    type: "reply",
    timestamp: "2026-03-05 03:45 PM",
    description: "Reply received from supplier with attachment",
  },
  {
    id: "evt-4",
    type: "detected",
    timestamp: "2026-03-05 03:46 PM",
    description: "PO number detected in email attachment",
  },
  {
    id: "evt-5",
    type: "updated",
    timestamp: "2026-03-05 03:52 PM",
    description: "Invoice updated and pending confirmation",
  },
];

export const initialPoDetections: PoDetection[] = [
  {
    id: "po-1",
    poNumber: "PO-2024-8765",
    source: "email",
    confidence: 95,
    evidencePreview: "Found in email body: 'Please reference PO-2024-8765 on the invoice.'",
    previewLabel: "Supplier email thread with highlighted PO number",
    previewType: "image",
    status: "pending",
  },
  {
    id: "po-2",
    poNumber: "PO-2024-8766",
    source: "pdf",
    confidence: 88,
    evidencePreview: "Extracted from PDF attachment page 1, header area.",
    previewLabel: "PDF attachment page 1 preview",
    previewType: "pdf",
    status: "pending",
  },
];
