import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/(legal)/_layout")({
  component: LegalLayout,
});

const APP_NAME = import.meta.env.VITE_APP_NAME ?? "Starter Template";

function LegalLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="text-lg font-semibold">
            {APP_NAME}
          </Link>
        </div>
      </header>
      <main className="container mx-auto max-w-3xl flex-1 px-4 py-12">
        <Outlet />
      </main>
      <footer className="border-t">
        <div className="container mx-auto flex h-16 items-center px-4 text-sm text-muted-foreground">
          © {new Date().getFullYear()} {APP_NAME}
        </div>
      </footer>
    </div>
  );
}
