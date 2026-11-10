import { createFileRoute, redirect } from "@tanstack/react-router";

/** The board now lives on the guest list, behind its Table | Board switch. */
export const Route = createFileRoute("/admin/insights")({
  beforeLoad: () => {
    throw redirect({ to: "/admin", search: { view: "board" }, replace: true });
  },
});
