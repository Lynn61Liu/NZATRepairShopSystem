export type Status = "pending_order" | "needs_pt" | "parts_trader" | "pickup_or_transit";

export interface Note {
  id: string;
  text: string;
  timestamp: string;
}

export interface CarDetails {
  owner: string;
  phone: string;
  vin: string;
  mileage: string;
  issue: string;
}

export interface WorkCard {
  id: string;
  jobId: string;
  carInfo: string;
  parts: string[];
  status: Status;
  notes: Note[];
  createdAt: string;
  details: CarDetails;
}
