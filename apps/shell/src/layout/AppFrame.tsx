import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function AppFrame() {
  return (
    <div className="flex h-full min-h-0 w-full">
      <aside className="h-full w-64 shrink-0 border-r border-[var(--ds-border)] bg-[var(--ds-panel)]">
        <Sidebar />
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--ds-bg)]">
        <div className="flex h-full min-h-0 flex-col p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
