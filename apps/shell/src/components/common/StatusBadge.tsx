type StatusBadgeValue = "Pass" | "Fail" | "Recheck";

type StatusBadgeProps = {
  value?: StatusBadgeValue | null;
};

export function StatusBadge({ value }: StatusBadgeProps) {
  if (!value) return null;
  const classes =
    value === "Pass"
      ? "bg-green-100 text-green-800"
      : value === "Recheck"
        ? "bg-yellow-100 text-yellow-800"
        : "bg-red-100 text-red-800";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${classes}`}>{value}</span>;
}
