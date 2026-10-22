import { barY, defineChart, stack } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { useMemo } from "react";

import type { VisitDay, VisitSource } from "@/lib/dashboard";

import { VISIT_SOURCES } from "@/lib/dashboard";

import { ChartCard } from "./chart-card";
import { dayTicks, formatCount, formatDay, plural } from "./format";
import { bottomLegend } from "./legend";

export const SOURCE_LABEL: Record<VisitSource, string> = {
  link: "Direct link",
  email: "Email button",
  lookup: "Name search",
  remembered: "Came back",
};

type Props = { days: readonly VisitDay[]; total: number; earlierDays: number };

/** Every time a party's page was opened, by how they got there. */
export function VisitsChart({ days, total, earlierDays }: Props) {
  const definition = useMemo(() => {
    const rows = days.flatMap((day) =>
      VISIT_SOURCES.map((source) => ({ day: day.day, source: SOURCE_LABEL[source], visits: day[source] })),
    );
    return defineChart({
      marks: [
        barY(rows, {
          x: "day",
          y: "visits",
          color: "source",
          layout: stack({ order: VISIT_SOURCES.map((source) => SOURCE_LABEL[source]) }),
          radius: { end: 2 },
        }),
      ],
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
      color: {
        domain: VISIT_SOURCES.map((source) => SOURCE_LABEL[source]),
        range: ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)"],
        legend: bottomLegend(),
      },
      focus: "group-x",
      tooltip,
    });
  }, [days]);

  const shown = days.reduce((sum, day) => sum + VISIT_SOURCES.reduce((inner, source) => inner + day[source], 0), 0);
  const bySource = VISIT_SOURCES.map((source) => ({
    source,
    visits: days.reduce((sum, day) => sum + day[source], 0),
  }));
  const busiest = days.reduce<VisitDay | undefined>((best, day) => {
    const count = (row: VisitDay) => VISIT_SOURCES.reduce((sum, source) => sum + row[source], 0);
    return best === undefined || count(day) > count(best) ? day : best;
  }, undefined);

  return (
    <ChartCard
      title="Visits per day"
      question="When parties open their invitation page, and how they got there."
      empty={total === 0 ? { title: "No visits yet", hint: "A visit is a party opening their own page." } : undefined}
      summary={
        <p>
          {plural(shown, "visit")} over {plural(days.length, "day")}
          {busiest
            ? `, busiest ${formatDay(busiest.day)} (${formatCount(VISIT_SOURCES.reduce((sum, source) => sum + busiest[source], 0))})`
            : ""}
          . {bySource.map((row) => `${SOURCE_LABEL[row.source]} ${formatCount(row.visits)}`).join(", ")}.
          {earlierDays > 0
            ? ` Showing the last ${days.length} days; ${formatCount(total - shown)} earlier visits not shown.`
            : ""}
        </p>
      }
      table={{
        caption: "Visits per day by source",
        columns: ["Day", ...VISIT_SOURCES.map((source) => SOURCE_LABEL[source])],
        rows: days.map((day) => [formatDay(day.day), ...VISIT_SOURCES.map((source) => day[source])]),
      }}
    >
      <Chart definition={definition} height={240} ariaLabel="Visits per day, stacked by source" />
    </ChartCard>
  );
}
