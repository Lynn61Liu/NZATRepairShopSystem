import type { LucideIcon } from "lucide-react";

export type ServiceType = "wof" | "mech" | "paint";
export type CustomerType = "personal" | "business";

export type ImportState = "idle" | "loading" | "success" | "error";

export type VehicleInfo = {
  model: string;
  year: string;
  color?: string;
  type?: string;
  vin?: string;
  fuelType?: string;
  nzFirstRegistration?: string;
  wofExpiry?: string;
  regoExpiry?: string;
};

export type ServiceOption = {
  id: ServiceType;
  label: string;
  icon: LucideIcon;
  catalogItemId?: string;
};

export type ServiceCatalogItem = {
  id: string | number;
  serviceType: ServiceType;
  category: "root" | "child";
  name: string;
  personalLinkCode?: string | null;
  dealershipLinkCode?: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type ChildServiceOption = {
  id: string;
  label: string;
  personalLinkCode?: string | null;
  dealershipLinkCode?: string | null;
};

export type BusinessOption = {
  id: string;
  label: string;
  businessCode?: string;
};
