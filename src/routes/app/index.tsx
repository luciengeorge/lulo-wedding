import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/")({
  component: DashboardPage,
});

function DashboardPage() {
  const { session } = Route.useRouteContext();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">Welcome{session?.user.name ? `, ${session.user.name.split(" ")[0]}` : ""}</h1>
      <p className="text-muted-foreground">
        This is the authenticated dashboard placeholder. Replace with your product UI.
      </p>
    </div>
  );
}
