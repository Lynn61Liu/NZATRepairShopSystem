export type Status = "quote" | "pending_order" | "needs_pt" | "parts_trader" | "pickup_or_transit";
export type PartFlowColumnStatus = Status | "waiting_quote";

export interface Note {
  id: string;
  text: string;
  timestamp: string;
}

export interface CarDetails {
  owner: string;
  phone: string;
  email: string;
  vin: string;
  mileage: string;
  issue: string;
  plate: string;
  make: string;
  model: string;
  year: string;
}

export interface ArrivalNotice {
  correlationId: string;
  recipientEmail: string;
  sentAt: string | null;
  lastSubject: string;
  lastBody: string;
}

export interface WorkCard {
  id: string;
  jobId: string;
  carInfo: string;
  parts: string[];
  status: Status;
  tags?: string[];
  selectedTags?: string[];
  notes: Note[];
  createdAt: string;
  details: CarDetails;
  arrivalNotice: ArrivalNotice;
}
