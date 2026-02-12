import { EmptyState } from "@/components/ui";
import { JOB_DETAIL_TEXT } from "@/features/jobDetail";

type EmptyPanelProps = {
  onAdd?: () => void;
};

export function EmptyPanel({ onAdd }: EmptyPanelProps) {
  return (
    <EmptyState
      message={JOB_DETAIL_TEXT.empty.noData}
      actionLabel={JOB_DETAIL_TEXT.buttons.add}
      onAction={onAdd}
    />
  );
}
