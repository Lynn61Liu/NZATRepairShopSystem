import type { PartsServiceStatus } from "@/types";
import { Select } from "@/components/ui";

const STATUS_OPTIONS: { value: PartsServiceStatus; label: string }[] = [
  { value: "pending_order", label: "待下单" },
  { value: "needs_pt", label: "需要发PT" },
  { value: "parts_trader", label: "PartsTrader" },
  { value: "pickup_or_transit", label: "待取/在途" },
];

type PartsStatusSelectProps = {
  value: PartsServiceStatus;
  onChange: (value: PartsServiceStatus) => void;
  disabled?: boolean;
};

export function PartsStatusSelect({ value, onChange, disabled }: PartsStatusSelectProps) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as PartsServiceStatus)}
      className="text-sm"
    >
      {STATUS_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}
