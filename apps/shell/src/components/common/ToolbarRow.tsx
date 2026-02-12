type ToolbarRowProps = {
  className?: string;
  children: React.ReactNode;
};

export function ToolbarRow({ className, children }: ToolbarRowProps) {
  return (
    <div className={["flex items-center gap-2", className].filter(Boolean).join(" ")}>{children}</div>
  );
}
