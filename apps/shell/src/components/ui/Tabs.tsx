type TabItem = {
  key: string;
  label: string;
};

type TabsProps = {
  tabs: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
};

export function Tabs({ tabs, activeKey, onChange, className = "" }: TabsProps) {
  return (
    <div className={["flex flex-wrap gap-2", className].join(" ")}
      role="tablist"
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={activeKey === tab.key}
          onClick={() => onChange(tab.key)}
          className={[
            "rounded-[8px] px-3 py-1.5 text-sm",
            activeKey === tab.key
              ? "bg-[rgba(78,90,255,0.12)] text-[rgba(78,90,255,0.9)]"
              : "text-[rgba(0,0,0,0.6)] hover:bg-[rgba(0,0,0,0.04)]",
          ].join(" ")}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
