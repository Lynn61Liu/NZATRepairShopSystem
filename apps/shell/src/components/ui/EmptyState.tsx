import { Button } from "./Button";

type EmptyStateProps = {
  message?: string;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ message, title, description, actionLabel, onAction }: EmptyStateProps) {
  const resolvedTitle = title ?? message ?? "No data";
  const resolvedDescription = description ?? (title ? message ?? "" : "");
  return (
    <div className="py-10 text-center">
      <div className="text-lg font-semibold text-[var(--ds-text)]">{resolvedTitle}</div>
      {resolvedDescription ? <div className="mt-2 text-sm text-[var(--ds-muted)]">{resolvedDescription}</div> : null}
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
