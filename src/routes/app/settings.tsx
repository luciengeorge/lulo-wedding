import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

const TABS = [
  { to: "/app/settings/profile", label: "Profile" },
  { to: "/app/settings/security", label: "Security" },
  { to: "/app/settings/billing", label: "Billing" },
  { to: "/app/settings/danger", label: "Danger zone" },
] as const;

export const Route = createFileRoute("/app/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  const location = useLocation();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">Manage your account, security, billing, and data.</p>
      </header>

      <nav className="border-b">
        <ul className="flex gap-2">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <Link
                to={tab.to}
                className={cn(
                  "inline-flex items-center px-3 py-2 text-sm font-medium transition-colors",
                  location.pathname === tab.to
                    ? "-mb-px border-b-2 border-foreground text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Outlet />
    </div>
  );
}
