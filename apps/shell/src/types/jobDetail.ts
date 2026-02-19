export type JobDetailTabKey = "WOF" | "Mechanical" | "Paint" | "Log" | "Invoice";

export type VehicleInfo = {
  plate: string;
  make?: string;
  model?: string;
  year?: number;
  vin?: string;
  engine?: string;
  regoExpiry?: string;
  colour?: string;
  bodyStyle?: string;
  engineNo?: string;
  chassis?: string;
  ccRating?: number;
  fuelType?: string;
  seats?: number;
  countryOfOrigin?: string;
  grossVehicleMass?: number;
  refrigerant?: string;
  fuelTankCapacityLitres?: number;
  fullCombinedRangeKm?: number;
  wofExpiry?: string;
  odometer?: number;
  nzFirstRegistration?: string;
  customerId?: number;
  updatedAt?: string;
  rawJson?: Record<string, unknown> | string | null;
};

export type CustomerInfo = {
  type: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  businessCode?: string;
  accountTerms: string;
  discount: string;
  notes: string;
};

export type WofRecordStatus = "Pass" | "Fail" | "Recheck";

export type WofRecord = {
  id: string;
  jobId?: string;
  occurredAt?: string;
  rego?: string;
  makeModel?: string;
  odo?: string;
  recordState?: WofRecordStatus | null;
  isNewWof?: boolean | null;
  authCode?: string;
  checkSheet?: string;
  csNo?: string;
  wofLabel?: string;
  labelNo?: string;
  failReasons?: string;
  previousExpiryDate?: string;
  organisationName?: string;
  excelRowNo?: number | string;
  sourceFile?: string;
  note?: string;
  wofUiState?: "Pass" | "Fail" | "Recheck" | "Printed";
  importedAt?: string;
  updatedAt?: string;
  source?: string;
};

export type WofCheckItem = {
  id: string;
  wofId?: string;
  occurredAt?: string;
  rego?: string;
  makeModel?: string;
  recordState?: "Pass" | "Fail" | "Recheck";
  isNewWof?: boolean | null;
  odo?: string;
  authCode?: string;
  checkSheet?: string;
  csNo?: string;
  wofLabel?: string;
  labelNo?: string;
  failReasons?: string;
  previousExpiryDate?: string;
  organisationName?: string;
  note?: string;
  wofUiState?: "Pass" | "Fail" | "Recheck" | "Printed";
  importedAt?: string;
  source?: string;
  sourceRow?: string;
  updatedAt?: string;
};

export type WofRecordUpdatePayload = {
  occurredAt?: string | null;
 rego?: string | null;
  makeModel?: string | null;
  odo?: string | null;
  recordState?: WofRecordStatus | null;
  isNewWof?: boolean | null;
  authCode?: string | null;
  checkSheet?: string | null;
  csNo?: string | null;
  wofLabel?: string | null;
  labelNo?: string | null;
  failReasons?: string | null;
  previousExpiryDate?: string | null;
  organisationName?: string | null;
  excelRowNo?: number | null;
  sourceFile?: string | null;
  note?: string | null;
  wofUiState?: "Pass" | "Fail" | "Recheck" | "Printed" | null;
  importedAt?: string | null;
};

export type WofFailReason = {
  id: string;
  label: string;
  isActive?: boolean;
};

export type PartsServiceStatus = "pending_order" | "needs_pt" | "parts_trader" | "pickup_or_transit";

export type PartsNote = {
  id: string;
  partsServiceId: string;
  note: string;
  createdAt?: string;
  updatedAt?: string;
};

export type PartsService = {
  id: string;
  jobId: string;
  description: string;
  status: PartsServiceStatus;
  createdAt?: string;
  updatedAt?: string;
  notes: PartsNote[];
};

export type PaintService = {
  id: string;
  jobId: string;
  status: string;
  currentStage: number;
  panels: number;
  createdAt?: string;
  updatedAt?: string;
};

export type JobDetailData = {
  id: string;
  status: string;
  isUrgent: boolean;
  tags: string[];
  notes?: string;
  createdAt?: string;
  vehicle: VehicleInfo;
  customer: CustomerInfo;
};
