import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { fetchPaintBoard } from "@/features/paint/api/paintApi";
import { countOverdue, type PaintBoardJob } from "@/features/paint/paintBoard.utils";
import { Plus } from "lucide-react";

const linkBase =
  "block  px-3 py-2 transition border border-transparent";
const linkActive =
  "bg-[var(--ds-primary)]  rounded border-[var(--ds-border)] text-white";
const linkIdle =
  "text-[var(--ds-muted)] hover:text-[var(--ds-text)] hover:bg-[rgba(255,255,255,0.04)]";

export function Sidebar() {
  const [paintOverdueCount, setPaintOverdueCount] = useState(0);

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
  return (
    <div className="h-full p-4 flex flex-col gap-6">
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

      <nav className="flex flex-col gap-2">
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
          Invoice
        </NavLink>

        <div className="pt-20">
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
          </div>
        </div>
      </nav>

      <div className="mt-auto text-xs text-[var(--ds-muted)]">v0.1 • 2026</div>
    </div>
  );
}
