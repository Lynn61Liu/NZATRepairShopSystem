type InfoRowProps = {
  label: string;
  value: string;
};

export function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="flex items-center justify-between text-xs text-[var(--ds-muted)]">
      <span>{label}</span>
      <span className="text-[rgba(0,0,0,0.7)]">{value}</span>
    </div>
  );
}
