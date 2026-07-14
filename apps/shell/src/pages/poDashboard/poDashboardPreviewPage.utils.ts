import type { PoTodoTab } from "@/features/poTodo/poTodo.types";

export function shouldShowXeroColumn(tab: PoTodoTab) {
  return tab !== "invoiced";
}

export function shouldShowPoDraftColumn(tab: PoTodoTab) {
  return tab !== "invoiced";
}

export function shouldShowSentColumn(tab: PoTodoTab) {
  return tab !== "invoiced";
}

export function shouldShowPoNumberColumn(tab: PoTodoTab) {
  return tab === "awaitingPo";
}

export function getPoTodoTableColSpan(tab: PoTodoTab) {
  if (tab === "pendingSend") return 10;
  if (tab === "invoiced") return 8;
  return shouldShowPoNumberColumn(tab) ? 10 : 9;
}

export function normalizePoNumberInput(value: string) {
  return value.replace(/\D/g, "");
}
