import type { PoTodoTab } from "@/features/poTodo/poTodo.types";

export function shouldShowXeroColumn(tab: PoTodoTab) {
  return tab !== "invoiced";
}

export function shouldShowPoDraftColumn(tab: PoTodoTab) {
  return tab === "pendingSend";
}

export function shouldShowSentColumn(tab: PoTodoTab) {
  return tab !== "invoiced";
}

export function shouldShowPoNumberColumn(tab: PoTodoTab) {
  return tab === "awaitingPo";
}

export function shouldShowCompletionActionColumn(tab: PoTodoTab) {
  return tab === "pendingSend";
}

export function getPoTodoTableColSpan(tab: PoTodoTab) {
  if (tab === "pendingSend") return 10;
  if (tab === "invoiced") return 8;
  return 12;
}

export function normalizePoNumberInput(value: string) {
  return value.replace(/\D/g, "");
}

export function formatPoTodoCreatedAt(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")} ${part("weekday")}`;
}

export function formatPoTodoSentAt(value?: string | null) {
  if (!value) return "Sent";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `${value} Sent`;

  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")} Sent`;
}
