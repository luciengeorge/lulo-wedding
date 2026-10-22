import { defineChart, lineY, ruleX, text } from "@tanstack/charts";
import { crosshair } from "@tanstack/charts/crosshair";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { useMemo } from "react";

import type { DayCount } from "@/lib/dashboard";

import { ChartCard } from "./chart-card";
import { dayTicks, formatCount, formatDay, plural } from "./format";
import { bottomLegend } from "./legend";

const SERIES = ["Coming", "Declined"] as const;

type Props = {
  days: readonly DayCount[];
  campaigns: readonly { day: string; kind: "invite" | "reminder" }[];
  undatedDeclines: number;
};

const KIND_LABEL = { invite: "Invites", reminder: "Reminder" } as const;

/**
 * Running totals of parties coming and declined, day by day, with a dashed
 * rule on each day a send run started: the bumps after a reminder are the
 * point of the chart.
 */
export function RepliesChart({ days, campaigns, undatedDeclines }: Props) {
  const last = days.at(-1);
  const definition = useMemo(() => {
    const points = days.flatMap((row) => [
      { day: row.day, series: SERIES[0], parties: row.coming },
      { day: row.day, series: SERIES[1], parties: row.declined },
    ]);
    // Labels ride above the highest point, so the lines never run through them.
    const top = Math.max(1, ...days.map((row) => Math.max(row.coming, row.declined))) * 1.12;
    const order = new Map(days.map((row, index) => [row.day, index]));
    // One label per day, even when two runs started on the same day.
    const markers = [...new Map(campaigns.map((run) => [run.day, run])).values()].map((run) => ({
      ...run,
      top,
      // Past halfway the label reads leftwards from its rule, so it stays inside the plot.
      late: (order.get(run.day) ?? 0) > days.length / 2,
    }));
    return defineChart({
      marks: [
        ruleX(markers, { x: "day", strokeDasharray: "3 3", strokeOpacity: 0.45 }),
        text(markers, {
          x: "day",
          y: "top",
          text: (run) => KIND_LABEL[run.kind],
          anchor: (run) => (run.late ? "end" : "start"),
          dx: (run) => (run.late ? -4 : 4),
          fontSize: 10,
        }),
        lineY(points, { x: "day", y: "parties", color: "series", strokeWidth: 2 }),
        crosshair({ x: true, y: false }),
      ],
      scales: {
        x: {
          // Fixed, so the send-run rules drawn first cannot reorder the days.
          scale: scalePoint<string>()
            .domain(days.map((row) => row.day))
            .padding(0.1),
          axis: { label: "Day (UTC)", ticks: { format: formatDay, values: dayTicks(days.map((row) => row.day)) } },
        },
        y: { scale: scaleLinear, nice: true, grid: true, axis: { label: "Parties, running total" } },
      },
      color: {
        domain: [...SERIES],
        range: ["var(--viz-ink)", "var(--viz-neutral)"],
        legend: bottomLegend(),
      },
      focus: "group-x",
      maxFocusDistance: Number.POSITIVE_INFINITY,
      tooltip,
    });
  }, [days, campaigns]);

  return (
    <ChartCard
      title="Replies over time"
      question="How replies have built up, and whether each round of invitations or reminders moved them."
      empty={
        last === undefined
          ? {
              title: "No replies yet",
              hint:
                undatedDeclines > 0
                  ? `${plural(undatedDeclines, "early decline")} from the sheet, with no date to plot.`
                  : "The line starts with the first reply.",
            }
          : undefined
      }
      summary={
        last ? (
          <p>
            {plural(last.coming, "party", "parties")} coming and {formatCount(last.declined)} declined online over{" "}
            {plural(days.length, "day")}
            {campaigns.length > 0 ? `; dashed lines mark ${plural(campaigns.length, "send run")}` : ""}.
            {undatedDeclines > 0
              ? ` ${plural(undatedDeclines, "early decline")} from the sheet ${undatedDeclines === 1 ? "has" : "have"} no date and ${undatedDeclines === 1 ? "is" : "are"} left out.`
              : ""}
          </p>
        ) : null
      }
      table={{
        caption: "Replies per day, running totals",
        columns: ["Day", "Coming", "Declined", "Send run"],
        rows: days.map((row) => [
          formatDay(row.day),
          row.coming,
          row.declined,
          campaigns
            .filter((run) => run.day === row.day)
            .map((run) => KIND_LABEL[run.kind])
            .join(", ") || "–",
        ]),
      }}
    >
      <Chart definition={definition} height={240} ariaLabel="Parties coming and declined, running total per day" />
    </ChartCard>
  );
}
