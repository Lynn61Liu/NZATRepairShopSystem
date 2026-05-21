import { Button } from "@/components/ui";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isProcessing?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isProcessing = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-lg rounded-[16px] bg-white p-5 shadow-xl">
        <div className="text-lg font-semibold text-[var(--ds-text)]">{title}</div>
        <div className="mt-3 whitespace-pre-line text-sm text-[var(--ds-muted)]">{message}</div>

        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose} disabled={isProcessing}>
            {cancelLabel}
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={isProcessing}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
