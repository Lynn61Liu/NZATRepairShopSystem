export type ServiceType = "wof" | "mech" | "paint";
export type CustomerType = "personal" | "business";

export type ImportState = "idle" | "loading" | "success" | "error";

export type VehicleInfo = {
  model: string;
  year: string;
};

type IconProps = {
  size?: number;
  className?: string;
};

export type ServiceOption = {
  id: ServiceType;
  label: string;
  icon: (props: IconProps) => JSX.Element;
};

export type BusinessOption = {
  id: string;
  label: string;
  businessCode?: string;
};
