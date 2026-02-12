import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function AppFrame() {
  return (
    <div className="h-full w-full flex">
      <aside className="w-64 shrink-0 border-r border-[var(--ds-border)] bg-[var(--ds-panel)]">
        <Sidebar />
      </aside>

      <main className="flex-1 min-w-0 bg-[var(--ds-bg)]">
        <div className="h-full p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
