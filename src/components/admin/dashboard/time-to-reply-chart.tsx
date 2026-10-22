import { barY, defineChart, text } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { useMemo } from "react";

import { ChartCard } from "./chart-card";
import { formatCount, plural } from "./format";

type Props = {
  bins: readonly { label: string; parties: number }[];
  medianDays?: number;
  unprompted: number;
};

function formatDays(days: number): string {
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} hours`;
  const rounded = Math.round(days * 10) / 10;
  return `${rounded} ${rounded === 1 ? "day" : "days"}`;
}

/** How long people sit on an invitation, counted from the first one on any channel. */
export function TimeToReplyChart({ bins, medianDays, unprompted }: Props) {
  const total = bins.reduce((sum, bin) => sum + bin.parties, 0);
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barY(bins, { x: "label", y: "parties", fill: "var(--viz-1)", radius: { end: 3 } }),
          text(
            bins.filter((bin) => bin.parties > 0),
            { x: "label", y: "parties", text: (bin) => formatCount(bin.parties), dy: -8, fill: "var(--foreground)" },
          ),
        ],
        scales: {
          x: { scale: () => scaleBand<string>().padding(0.2), axis: { label: "Days from first invitation" } },
          y: { scale: scaleLinear, nice: true, grid: true, axis: { label: "Parties", ticks: { count: 4 } } },
        },
        tooltip,
      }),
    [bins],
  );

  return (
    <ChartCard
      title="Time to reply"
      question="How long parties take to answer after their first invitation, by email or WhatsApp."
      empty={
        total === 0
          ? {
              title: "No replies to an invitation yet",
              hint:
                unprompted > 0
                  ? `${plural(unprompted, "party", "parties")} replied before any invitation was recorded.`
                  : undefined,
            }
          : undefined
      }
      summary={
        <p>
          Median {medianDays === undefined ? "–" : formatDays(medianDays)} across {plural(total, "reply", "replies")}.
          {unprompted > 0
            ? ` ${plural(unprompted, "party", "parties")} replied with no invitation on record, and ${unprompted === 1 ? "is" : "are"} left out.`
            : ""}
        </p>
      }
      table={{
        caption: "Parties by days from first invitation to reply",
        columns: ["Days", "Parties"],
        rows: bins.map((bin) => [bin.label, bin.parties]),
      }}
    >
      <Chart definition={definition} height={220} ariaLabel="Histogram of days from first invitation to reply" />
    </ChartCard>
  );
}
