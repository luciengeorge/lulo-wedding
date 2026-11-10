import { barY, defineChart } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { useMemo } from "react";

import type { VisitDay, VisitSource } from "@/lib/dashboard";

import { VISIT_SOURCES } from "@/lib/dashboard";

import { ChartCard } from "./chart-card";
import { dayTicks, formatCount, formatDay, plural } from "./format";

export const SOURCE_LABEL: Record<VisitSource, string> = {
  link: "Direct link",
  email: "Email button",
  lookup: "Name search",
  remembered: "Came back",
};

type Props = { days: readonly VisitDay[]; total: number; earlierDays: number };

const dayTotal = (day: VisitDay) => VISIT_SOURCES.reduce((sum, source) => sum + day[source], 0);

/** Every time a party's page was opened, one column a day. How they got there is in the words below. */
export function VisitsChart({ days, total, earlierDays }: Props) {
  const definition = useMemo(() => {
    const rows = days.map((day) => ({ day: day.day, visits: dayTotal(day) }));
    return defineChart({
      marks: [barY(rows, { x: "day", y: "visits", fill: () => "var(--viz-1)", radius: { end: 2 } })],
      scales: {
        x: {
          scale: () => scaleBand<string>().padding(0.15),
          axis: {
            label: "Day (UTC)",
            ticks: { format: formatDay, size: 0, values: dayTicks(days.map((day) => day.day)) },
          },
        },
        y: { scale: scaleLinear, nice: true, grid: true, axis: { label: "Visits", ticks: { count: 4 } } },
      },
      tooltip,
    });
  }, [days]);

  const shown = days.reduce((sum, day) => sum + dayTotal(day), 0);
  const bySource = VISIT_SOURCES.map((source) => ({
    source,
    visits: days.reduce((sum, day) => sum + day[source], 0),
  }));
  const busiest = days.reduce<VisitDay | undefined>(
    (best, day) => (best === undefined || dayTotal(day) > dayTotal(best) ? day : best),
    undefined,
  );

  return (
    <ChartCard
      title="Visits per day"
      question="When parties open their invitation page, and how they got there."
      empty={total === 0 ? { title: "No visits yet", hint: "A visit is a party opening their own page." } : undefined}
      summary={
        <p>
          {plural(shown, "visit")} over {plural(days.length, "day")}
          {busiest ? `, busiest ${formatDay(busiest.day)} (${formatCount(dayTotal(busiest))})` : ""}.{" "}
          {bySource.map((row) => `${SOURCE_LABEL[row.source]} ${formatCount(row.visits)}`).join(", ")}.
          {earlierDays > 0
            ? ` Showing the last ${days.length} days; ${formatCount(total - shown)} earlier visits not shown.`
            : ""}
        </p>
      }
      table={{
        caption: "Visits per day by source",
        columns: ["Day", "Visits", ...VISIT_SOURCES.map((source) => SOURCE_LABEL[source])],
        rows: days.map((day) => [formatDay(day.day), dayTotal(day), ...VISIT_SOURCES.map((source) => day[source])]),
      }}
    >
      <Chart definition={definition} height={240} ariaLabel="Visits per day" />
    </ChartCard>
  );
}
