import type { LucideIcon } from "lucide-react";

export type ServiceType = "wof" | "mech" | "paint";
export type CustomerType = "personal" | "business";

export type ImportState = "idle" | "loading" | "success" | "error";

export type VehicleInfo = {
  model: string;
  year: string;
};

export type ServiceOption = {
  id: ServiceType;
  label: string;
  icon: LucideIcon;
};

export type BusinessOption = {
  id: string;
  label: string;
  businessCode?: string;
};
