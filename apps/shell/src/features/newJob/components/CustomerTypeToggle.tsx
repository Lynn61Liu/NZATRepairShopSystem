import type { CustomerType } from "@/features/newJob/newJob.types";

const options: Array<{ id: CustomerType; label: string }> = [
  { id: "personal", label: "个人" },
  { id: "business", label: "商户" },
];

type CustomerTypeToggleProps = {
  value: CustomerType;
  onChange: (next: CustomerType) => void;
};

export function CustomerTypeToggle({ value, onChange }: CustomerTypeToggleProps) {
  return (
    <div className="flex gap-3">
      {options.map((option) => (
        <label key={option.id} className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="customerType"
            value={option.id}
            checked={value === option.id}
            onChange={() => onChange(option.id)}
            className="h-4 w-4"
          />
          <span className="text-sm text-[rgba(0,0,0,0.70)]">{option.label}</span>
        </label>
      ))}
    </div>
  );
}
