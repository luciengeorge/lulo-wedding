import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { api } from "@/../convex/_generated/api";
import { ChartCardSkeleton } from "@/components/admin/dashboard/chart-card";
import { DashboardCharts } from "@/components/admin/dashboard/dashboard-charts";
import { formatCount, plural } from "@/components/admin/dashboard/format";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({
    meta: seo({
      title: "Dashboard",
      description: "Replies, headcount and invitations at a glance.",
      path: "/admin/dashboard",
      noPreview: true,
    }),
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const data = useQuery(api.admin.dashboard, {});

  return (
    <main className="flex flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-[15px] font-semibold">Dashboard</h1>
        {data ? (
          <p className="text-[12px] text-muted-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
            {plural(data.parties, "party", "parties")} · {formatCount(data.replies)} replied
          </p>
        ) : null}
      </div>
      {data === undefined ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <ChartCardSkeleton key={index} />
          ))}
        </div>
      ) : (
        <DashboardCharts data={data} />
      )}
    </main>
  );
}
