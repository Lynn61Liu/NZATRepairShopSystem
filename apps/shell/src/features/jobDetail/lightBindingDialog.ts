export function shouldAutoCloseLightBindingDialog(
  bindDialogOpen: boolean,
  bindingStatus?: string | null,
) {
  return bindDialogOpen && bindingStatus === "Bound";
}
