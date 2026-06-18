export type CourtesyCarStatus = "available" | "on_loan" | "unavailable";

export type CourtesyCarStatusAction = CourtesyCarStatus | "returned";

export type CourtesyCarAttachmentKind = "image" | "file";

export type CourtesyCarAttachment = {
  id: string;
  kind: CourtesyCarAttachmentKind;
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  createdAt: string;
};

export type CourtesyCarCurrentAgreement = {
  agreementId: number;
  jobId: number;
  status: string;
  currentStep: string;
  jobVehiclePlate?: string | null;
  jobCustomerName?: string | null;
  jobCustomerPhone?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
};

export type CourtesyCarWarningLevel = "warning" | "critical";

export type CourtesyCarWarning = {
  key: "wof" | "rego";
  level: CourtesyCarWarningLevel;
  label: string;
  daysRemaining: number;
};

export type CourtesyCarTheme = {
  headerGradient: string;
  accentTone: string;
  headerTextClass: string;
  bodyClass: string;
  badgeClass: string;
  buttonClass: string;
};

export type CourtesyCar = {
  id: string;
  plate: string;
  make: string;
  model: string;
  color: string;
  year?: number | null;
  mileage?: number | null;
  fuelLevel?: string;
  agreedValue: number;
  status: CourtesyCarStatus;
  note?: string;
  wofExpiry?: string | null;
  regoExpiry?: string | null;
  loanedAt?: string | null;
  borrowerName?: string;
  borrowerPhone?: string;
  currentAgreement?: CourtesyCarCurrentAgreement | null;
  returnedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: CourtesyCarAttachment[];
};

export type CourtesyCarDraft = {
  plate: string;
  make?: string;
  model?: string;
  color?: string;
  year?: number | string | null;
  mileage?: number | string | null;
  fuelLevel?: string;
  agreedValue: number | string;
  status: CourtesyCarStatus;
  note?: string;
  wofExpiry?: string | null;
  regoExpiry?: string | null;
  loanedAt?: string | null;
  borrowerName?: string;
  borrowerPhone?: string;
};

export type CourtesyCarEditorValues = {
  plate: string;
  make: string;
  model: string;
  color: string;
  year: string;
  mileage: string;
  fuelLevel: string;
  agreedValue: string;
  status: CourtesyCarStatus;
  note: string;
  wofExpiry: string;
  regoExpiry: string;
  loanedAt: string;
  borrowerName: string;
  borrowerPhone: string;
  attachments: CourtesyCarAttachment[];
};

export type CourtesyCarValidationResult = {
  valid: boolean;
  errors: Partial<Record<"plate" | "status" | "agreedValue" | "note", string>>;
};
