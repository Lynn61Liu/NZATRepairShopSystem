import { requestJson } from "@/utils/api";

export function fetchPartFlow() {
  return requestJson<any>("/api/parts-flow");
}
