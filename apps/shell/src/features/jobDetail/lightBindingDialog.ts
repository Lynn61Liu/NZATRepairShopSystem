export type LightBindingStatusCandidate = {
  status?: string | null;
};

export const LIGHT_TAG_PATTERN = /^AD1[0-9A-F]{9}$/;

export function normalizeLightTagInput(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function shouldAutoCloseLightBindingDialog(
  bindDialogOpen: boolean,
  bindingStatus?: string | null,
) {
  return bindDialogOpen && bindingStatus === "Bound";
}

export function selectCurrentLightBinding<T extends LightBindingStatusCandidate>(
  bindings: T[] | null | undefined,
): T | null {
  if (!bindings || bindings.length === 0) return null;

  return bindings.find((item) => item.status === "Bound")
    ?? bindings.find((item) => item.status === "PendingBind")
    ?? null;
}
