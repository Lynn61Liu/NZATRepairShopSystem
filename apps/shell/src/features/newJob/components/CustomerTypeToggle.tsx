import type { CustomerType } from "@/features/newJob/newJob.types";

const options: Array<{ id: CustomerType; label: string }> = [
  { id: "personal", label: "personal" },
  { id: "business", label: "Merchant" },
];

type CustomerTypeToggleProps = {
  value: CustomerType;
  onChange: (next: CustomerType) => void;
};

export function CustomerTypeToggle({ value, onChange }: CustomerTypeToggleProps) {
  return (
    <div className="inline-flex rounded-[12px] bg-[rgba(0,0,0,0.05)] p-1">
      {options.map((option) => (
        <label key={option.id} className="cursor-pointer">
          <input
            type="radio"
            name="customerType"
            value={option.id}
            checked={value === option.id}
            onChange={() => onChange(option.id)}
            className="sr-only"
          />
          <span
            className={[
              "inline-flex min-w-[96px] items-center justify-center rounded-[10px] px-5 py-2 text-base font-medium transition-colors",
              value === option.id
                ? "bg-[#dc2626] text-white shadow-sm"
                : "text-[rgba(0,0,0,0.70)] hover:bg-[rgba(0,0,0,0.06)]",
            ].join(" ")}
          >
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}
