import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { subscribeWorklogCostAlert } from "@/utils/refreshSignals";
import { usePoUnreadSummary } from "@/features/jobs";
import { requestJson } from "@/utils/api";
import { WOF_SIDEBAR_REFRESH_MS } from "./sidebarRefreshIntervals";
import {
  ArrowLeftRight,
  CalendarClock,
  CarFront,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Cog,
  LayoutDashboard,
  FileSignature,
  FileText,
  Hash,
  KeyRound,
  PackageOpen,
  Paintbrush2,
  Plus,
  ReceiptText,
  Settings2,
  ShoppingBag,
  Tags,
  TriangleAlert,
  type LucideIcon,
  Users,
  Wrench,
} from "lucide-react";

const linkBase =
  "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 transition border border-transparent";
const linkActive =
  "bg-[var(--ds-primary)] border-[var(--ds-border)] text-white shadow-sm";
const linkIdle =
  "text-[var(--ds-muted)] hover:text-[var(--ds-text)] hover:bg-[rgba(255,255,255,0.04)]";

type SidebarItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

type SidebarGroupItem = SidebarItem & {
  child?: boolean;
};

const settingsPathRoots = [
  "/customers",
  "/tags",
  "/wof-fails",
  "/service-settings",
  "/eftpos-quick-jobs",
  "/xero-item-codes",
  "/integrations",
];

function isPathActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function Sidebar() {
  const [worklogAlertCount, setWorklogAlertCount] = useState(() => {
    const stored = localStorage.getItem("worklog:cost-alert");
    return stored ? Number(stored) || 0 : 0;
  });
  const [wofTodoCount, setWofTodoCount] = useState(0);
  const [settingsCollapsed, setSettingsCollapsed] = useState(true);
  const [courtesyCarCollapsed, setCourtesyCarCollapsed] = useState(true);
  const poUnreadSummary = usePoUnreadSummary();
  const location = useLocation();

  const mainItems: SidebarItem[] = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/jobs", label: "工单中心", icon: FileText },
    { to: "/car-on-yard", label: "Car On Yard", icon: CarFront },
    { to: "/parts-flow", label: "报价-配件", icon: Cog },
    { to: "/invoice", label: "发票", icon: CircleDollarSign },
    { to: "/wof-schedule", label: "WOF 排班表", icon: CalendarClock, badge: wofTodoCount },
    { to: "/po-dashboard-preview", label: "PO", icon: ReceiptText, badge: poUnreadSummary.totalUnreadReplies },
    { to: "/paint-tech", label: "喷漆看板", icon: Paintbrush2 },
    { to: "/mech-board", label: "机修看板", icon: Wrench },
    { to: "/device-communication", label: "找钥匙", icon: KeyRound },
    { to: "/worklog", label: "工时", icon: Clock3, badge: worklogAlertCount },
    { to: "/shop", label: "库存", icon: ShoppingBag },
    { to: "/procurement-admin", label: "采购", icon: PackageOpen },
  ];

  const courtesyCarItems: SidebarGroupItem[] = [
    { to: "/courtesy-cars", label: "代步车管理", icon: CarFront, child: true },
    { to: "/courtesy-car-drafts", label: "协议草稿", icon: FileSignature, child: true },
    { to: "/agreement-history", label: "代步车合同", icon: Clock3, child: true },
  ];

  const settingsItems: SidebarItem[] = [
    { to: "/customers", label: "客户管理", icon: Users },
    { to: "/tags", label: "标签", icon: Tags },
    { to: "/wof-fails", label: "WOF 失败原因", icon: TriangleAlert },
    { to: "/service-settings", label: "服务目录", icon: Wrench },
    { to: "/eftpos-quick-jobs", label: "EFTPOS 快速项目", icon: CircleDollarSign },
    { to: "/xero-item-codes", label: "Xero 项目编码", icon: Hash },
    { to: "/integrations", label: "账号切换", icon: ArrowLeftRight },
  ];

  const settingsRouteActive = settingsPathRoots.some((path) => isPathActive(location.pathname, path));
  const settingsOpen = settingsRouteActive || !settingsCollapsed;
  const courtesyCarRouteActive = courtesyCarItems.some(({ to }) => isPathActive(location.pathname, to));
  const courtesyCarOpen = courtesyCarRouteActive || !courtesyCarCollapsed;

  useEffect(() => {
    return subscribeWorklogCostAlert((count) => setWorklogAlertCount(count));
  }, []);

  // --- 保留正式版中的 WOF 排班表计数逻辑 ---
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const res = await requestJson<{ jobs?: Array<unknown> }>("/api/jobs/wof-schedule");
      if (!res.ok || cancelled) return;
      const count = Array.isArray(res.data?.jobs)
        ? res.data.jobs.filter((job) => {
            if (typeof job !== "object" || job === null) return false;
            const status = (job as { wofStatus?: unknown }).wofStatus;
            return status === "Todo" || status === "Checked";
          }).length
        : 0;
      setWofTodoCount(count);
    };

    const initialTimer = window.setTimeout(() => void load(), 300);
    const timer = window.setInterval(() => {
      void load();
    }, WOF_SIDEBAR_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="h-full p-4 flex flex-col gap-6 flex-1 min-h-0">
      <div>
        <div className="text-base font-semibold">NZAT</div>
        <div className="text-xs text-[var(--ds-muted)]"></div>
      </div>

      <NavLink
        to="/jobs/new"
        className="inline-flex items-center justify-center gap-2 rounded-md bg-red-100  px-3 py-2 text-sm font-semibold text-[var(--ds-primary)] border border-gery hover:bg-[var(--ds-primary)] hover:text-white transition-colors"
      >
        <Plus className="h-4 w-4" />
        快速新建工单
      </NavLink>

      <nav className="flex flex-1 flex-col justify-between gap-6 min-h-0">
        <div className="flex flex-col gap-2">
          {mainItems.map(({ to, label, icon: Icon, badge }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}>
              <span className="flex min-w-0 items-center gap-3">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{label}</span>
              </span>
              {badge && badge > 0 ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                  {badge}
                </span>
              ) : null}
            </NavLink>
          ))}

          <div className="mt-1">
            <button
              type="button"
              aria-expanded={courtesyCarOpen}
              className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 transition border border-transparent ${
                courtesyCarOpen ? linkActive : linkIdle
              }`}
              onClick={() => setCourtesyCarCollapsed((open) => !open)}
            >
              <span className="flex min-w-0 items-center gap-3">
                <CarFront className="h-4 w-4 shrink-0" />
                <span className="truncate">代步车</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${courtesyCarOpen ? "rotate-180" : ""}`} />
            </button>

            {courtesyCarOpen ? (
              <div className="mt-2 flex flex-col gap-2 pl-4">
                {courtesyCarItems.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `${linkBase} pl-4 ${isActive ? linkActive : linkIdle}`
                    }
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{label}</span>
                    </span>
                  </NavLink>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div>
          <button
            type="button"
            aria-expanded={settingsOpen}
            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs font-semibold tracking-[0.04em] text-[var(--ds-muted)] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--ds-text)]"
            onClick={() => setSettingsCollapsed((open) => !open)}
          >
            <span className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              <span>设置</span>
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${settingsOpen ? "rotate-180" : ""}`} />
          </button>

          {settingsOpen ? (
            <div className="mt-2 flex flex-col gap-2">
              {settingsItems.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}>
                  <span className="flex min-w-0 items-center gap-3">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{label}</span>
                  </span>
                </NavLink>
              ))}
            </div>
          ) : null}
        </div>
      </nav>

    </div>
  );
}
