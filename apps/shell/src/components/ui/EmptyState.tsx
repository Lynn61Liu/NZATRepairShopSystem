import { Button } from "./Button";

type EmptyStateProps = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="py-10 text-center">
      <div className="text-sm text-[var(--ds-muted)]">{message}</div>
      {actionLabel ? (
        <div className="mt-3 flex justify-center">
          <Button variant="primary" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
