import { Wrench, Droplets, FileText } from "lucide-react";
import type { ServiceOption, BusinessOption } from "./newJob.types";

export const serviceOptions: ServiceOption[] = [
  { id: "wof", label: "WOF", icon: FileText },
  { id: "mech", label: "机修", icon: Wrench },
  { id: "paint", label: "喷漆", icon: Droplets },
];

export const businessOptions: BusinessOption[] = [
  { id: "biz1", label: "ABC 汽车维修厂" },
  { id: "biz2", label: "XYZ 汽车服务" },
  { id: "biz3", label: "123 维修中心" },
];
