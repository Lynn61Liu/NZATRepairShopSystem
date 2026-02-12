import { EmptyPanel } from "./EmptyPanel";

type PaintPanelProps = {
  onAdd?: () => void;
};

export function PaintPanel({ onAdd }: PaintPanelProps) {
  return <EmptyPanel onAdd={onAdd} />;
}
