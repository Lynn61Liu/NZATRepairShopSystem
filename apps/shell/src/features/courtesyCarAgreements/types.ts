export type CourtesyCarStatus = "available" | "on_loan" | "unavailable";

export type CourtesyCarVehicle = {
  id: number;
  plate: string;
  make?: string | null;
  model?: string | null;
  color?: string | null;
  year?: number | null;
  mileage?: number | null;
  fuelLevel?: string | null;
  agreedVehicleValue: number;
  status: CourtesyCarStatus;
  note?: string | null;
  wofExpiry?: string | null;
  regoExpiry?: string | null;
  returnedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CourtesyCarAgreementStatus = "draft" | "in_progress" | "inprogress" | "active" | "submitted" | "closed" | "cancelled";

export type CourtesyCarAgreementStep =
  | "contact"
  | "vehicle"
  | "license"
  | "terms"
  | "signature"
  | "review"
  | "submitted"
  | "closed";

export type CourtesyCarAgreementAttachment = {
  id: string;
  kind: string;
  name: string;
  mimeType: string;
  size: number;
  downloadUrl: string;
  createdAt: string;
};

export type CourtesyCarAgreementEvent = {
  id: number;
  eventType: string;
  actorType?: string | null;
  actorName?: string | null;
  payloadJson?: string | null;
  createdAt: string;
};

export type CourtesyCarAgreementPreviewValidation = {
  agreementId: number;
  isValid: boolean;
  message?: string | null;
};

export type CourtesyCarAgreementListItem = {
  id: number;
  jobId: number;
  jobVehiclePlate?: string | null;
  jobCustomerName?: string | null;
  jobCustomerPhone?: string | null;
  jobCustomerEmail?: string | null;
  jobCustomerAddress?: string | null;
  vehicleId: number | null;
  vehiclePlate?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  status: CourtesyCarAgreementStatus;
  currentStep: CourtesyCarAgreementStep;
  submittedAt?: string | null;
  closedAt?: string | null;
  cancelledAt?: string | null;
  emailSentAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CourtesyCarAgreementDetail = CourtesyCarAgreementListItem & {
  customerId?: number | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactAddress?: string | null;
  driverLicenseNumber?: string | null;
  driverLicenseExpiry?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  termsConfirmed: boolean;
  signatureName?: string | null;
  vehicleColor?: string | null;
  vehicleYear?: number | null;
  vehicleMileage?: number | null;
  vehicleFuelLevel?: string | null;
  agreedVehicleValue: number;
  vehicleWofExpiry?: string | null;
  vehicleRegoExpiry?: string | null;
  attachments: CourtesyCarAgreementAttachment[];
  events: CourtesyCarAgreementEvent[];
  pdfUrl?: string | null;
  pdfGeneratedAt?: string | null;
  emailSentAt?: string | null;
  emailTo?: string | null;
  emailMessageId?: string | null;
  submittedAt?: string | null;
  closedAt?: string | null;
  cancelledAt?: string | null;
};

export type CourtesyCarAgreementUpdatePayload = {
  status?: CourtesyCarAgreementStatus;
  currentStep?: CourtesyCarAgreementStep;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactAddress?: string;
  driverLicenseNumber?: string;
  driverLicenseExpiry?: string | null;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  termsConfirmed?: boolean;
  signatureName?: string;
};
