import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { fetchPaintBoard } from "@/features/paint/api/paintApi";
import { countOverdue, type PaintBoardJob } from "@/features/paint/paintBoard.utils";
import { subscribeWorklogCostAlert } from "@/utils/refreshSignals";
import { usePoUnreadSummary } from "@/features/jobs";
import { requestJson } from "@/utils/api";
import { Plus } from "lucide-react";

const linkBase =
  "block  px-3 py-2 transition border border-transparent";
const linkActive =
  "bg-[var(--ds-primary)]  rounded border-[var(--ds-border)] text-white";
const linkIdle =
  "text-[var(--ds-muted)] hover:text-[var(--ds-text)] hover:bg-[rgba(255,255,255,0.04)]";

export function Sidebar() {
  const [paintOverdueCount, setPaintOverdueCount] = useState(0);
  const [worklogAlertCount, setWorklogAlertCount] = useState(0);
  const [wofTodoCount, setWofTodoCount] = useState(0);
  const poUnreadSummary = usePoUnreadSummary();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await fetchPaintBoard();
      if (!res.ok) return;
      const list = Array.isArray(res.data?.jobs) ? (res.data.jobs as PaintBoardJob[]) : [];
      if (!cancelled) setPaintOverdueCount(countOverdue(list));
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("worklog:cost-alert");
    if (stored) setWorklogAlertCount(Number(stored) || 0);
    return subscribeWorklogCostAlert((count) => setWorklogAlertCount(count));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const res = await requestJson<{ jobs?: Array<unknown> }>("/api/jobs/wof-schedule");
      if (!res.ok || cancelled) return;
      const count = Array.isArray(res.data?.jobs)
        ? res.data.jobs.filter((job: any) => job?.wofStatus === "Todo" || job?.wofStatus === "Checked").length
        : 0;
      setWofTodoCount(count);
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 60000);

    return () => {
      cancelled = true;
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
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `${linkBase} ${isActive ? linkActive : linkIdle}`
            }
          >
            Dashboard
          </NavLink>

          <NavLink
            to="/jobs"
            className={({ isActive }) =>
              `${linkBase} ${isActive ? linkActive : linkIdle}`
            }
          >
            Jobs
          </NavLink>

          <NavLink
            to="/paint-board"
            className={({ isActive }) =>
              `${linkBase} ${isActive ? linkActive : linkIdle}`
            }
          >
            <span className="flex items-center justify-between gap-2">
              <span>PNP Board</span>
              {paintOverdueCount > 0 ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                  {paintOverdueCount}
                </span>
              ) : null}
            </span>
          </NavLink>

        <NavLink
          to="/worklog"
          className={({ isActive }) =>
            `${linkBase} ${isActive ? linkActive : linkIdle}`
          }
        >
          <span className="flex items-center justify-between gap-2">
            <span>Worklog</span>
            {worklogAlertCount > 0 ? (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                {worklogAlertCount}
              </span>
            ) : null}
          </span>
        </NavLink>

          <NavLink
            to="/parts-flow"
            className={({ isActive }) =>
              `${linkBase} ${isActive ? linkActive : linkIdle}`
            }
          >
            Part Flow
          </NavLink>

          <NavLink
            to="/invoice"
            className={({ isActive }) =>
              `${linkBase} ${isActive ? linkActive : linkIdle}`
            }
          >
            Invoice Payment
          </NavLink>

          <NavLink
            to="/wof-schedule"
            className={({ isActive }) =>
              `${linkBase} ${isActive ? linkActive : linkIdle}`
            }
          >
            <span className="flex items-center justify-between gap-2">
              <span>WOF 排班表</span>
              {wofTodoCount > 0 ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                  {wofTodoCount}
                </span>
              ) : null}
            </span>
          </NavLink>

          <NavLink
            to="/po-dashboard-preview"
            className={({ isActive }) =>
              `${linkBase} ${isActive ? linkActive : linkIdle}`
            }
          >
            <span className="flex items-center justify-between gap-2">
              <span>PO Ops Preview</span>
              {poUnreadSummary.totalUnreadReplies > 0 ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                  {poUnreadSummary.totalUnreadReplies}
                </span>
              ) : null}
            </span>
          </NavLink>
        </div>

        <div>
          <div className="px-3 text-[11px] uppercase tracking-[0.08em] text-[var(--ds-muted)] font-bold border-b border-[var(--ds-border)] pt-2">
            Settings
          </div>
          <div className="mt-2 flex flex-col gap-2">
            <NavLink
              to="/customers"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkIdle}`
              }
            >
              Customer
            </NavLink>
            <NavLink
              to="/tags"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkIdle}`
              }
            >
              Tag
            </NavLink>
            <NavLink
              to="/wof-fails"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkIdle}`
              }
            >
              WOF Fails
            </NavLink>
            <NavLink
              to="/service-settings"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkIdle}`
              }
            >
              Service Settings
            </NavLink>
            <NavLink
              to="/xero-item-codes"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkIdle}`
              }
            >
              Xero Item Code
            </NavLink>
            <NavLink
              to="/integrations"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkIdle}`
              }
            >
              Account Switch
            </NavLink>
          </div>
        </div>
      </nav>

      <div className="mt-auto text-xs text-[var(--ds-muted)]">v0.1 • 2026</div>
    </div>
  );
}
