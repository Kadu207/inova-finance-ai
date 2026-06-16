import { AppSidebar } from "./app-sidebar";
import { TenantSwitcher } from "./tenant-switcher";
import { LogoutButton } from "./logout-button";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="ina-app" data-testid="dashboard-shell">
      <AppSidebar />
      <div className="ina-main">
        <header className="ina-topbar">
          <TenantSwitcher />
          <LogoutButton />
        </header>
        <main className="ina-content">{children}</main>
      </div>
    </div>
  );
}
