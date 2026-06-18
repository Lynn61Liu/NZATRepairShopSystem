export function getSubmitErrorMessage(error: string | null | undefined) {
  const trimmed = error?.trim();
  return trimmed ? trimmed : null;
}
