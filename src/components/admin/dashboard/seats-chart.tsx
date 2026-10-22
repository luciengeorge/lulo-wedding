import { barX, defineChart, stack, text } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { useMemo } from "react";

import type { EventSeats } from "@/lib/dashboard";

import { ChartCard } from "./chart-card";
import { EVENT_LABEL, formatCount, plural } from "./format";
import { bottomLegend } from "./legend";

const STATUSES = ["Coming", "Plus-ones coming", "Not coming", "No answer yet"] as const;
type Status = (typeof STATUSES)[number];
const STATUS_PAINT = ["var(--viz-ink)", "var(--viz-ink-soft)", "var(--viz-neutral)", "var(--viz-faint)"];

type Segment = { event: string; status: Status; count: number };

export function seatSegments(rows: readonly EventSeats[]): Segment[] {
  return rows.flatMap((row) => {
    const event = EVENT_LABEL[row.event];
    return [
      { event, status: "Coming" as const, count: row.coming },
      { event, status: "Plus-ones coming" as const, count: row.plusOnesComing },
      { event, status: "Not coming" as const, count: row.notComing },
      { event, status: "No answer yet" as const, count: row.noAnswer },
    ];
  });
}

/**
 * Who is coming to what, in seats. Plus-ones hold no seat of their own, so
 * they sit as a separate segment after the seats who said yes: a bar's length
 * is the people to cater for plus everyone still to answer.
 */
export function SeatsChart({ rows }: { rows: readonly EventSeats[] }) {
  const invited = rows.filter((row) => row.seats > 0);
  const definition = useMemo(() => {
    const segments = seatSegments(invited);
    const totals = invited.map((row) => ({
      event: EVENT_LABEL[row.event],
      end: row.coming + row.plusOnesComing + row.notComing + row.noAnswer,
      label: formatCount(row.seats),
    }));
    return defineChart({
      marks: [
        barX(segments, {
          x: "count",
          y: "event",
          color: "status",
          layout: stack({ order: [...STATUSES] }),
          stroke: "var(--card)",
          strokeWidth: 1.5,
          radius: { end: 3 },
        }),
        text(totals, { x: "end", y: "event", text: "label", anchor: "start", dx: 6, fill: "var(--foreground)" }),
      ],
      scales: {
        x: { scale: scaleLinear, nice: true, grid: true, axis: { label: "Seats" } },
        y: { scale: () => scaleBand<string>().padding(0.35), axis: { ticks: { size: 0 } } },
      },
      color: {
        domain: [...STATUSES],
        range: STATUS_PAINT,
        legend: bottomLegend(),
      },
      tooltip,
    });
  }, [invited]);

  return (
    <ChartCard
      title="Seats per event"
      question="How many invited seats have said yes, said no, or not answered, for each event."
      empty={
        invited.length === 0
          ? { title: "No one invited yet", hint: "Seats appear once a party is invited to an event." }
          : undefined
      }
      summary={
        <ul className="flex flex-col gap-0.5">
          {invited.map((row) => (
            <li key={row.event}>
              <span className="font-medium text-foreground">{EVENT_LABEL[row.event]}</span>: {formatCount(row.coming)}{" "}
              of {plural(row.seats, "seat")} coming
              {row.plusOnesComing > 0 ? ` (+${plural(row.plusOnesComing, "plus-one")})` : ""},{" "}
              {formatCount(row.notComing)} not coming, {formatCount(row.noAnswer)} no answer yet.
            </li>
          ))}
        </ul>
      }
      table={{
        caption: "Seats per event",
        columns: ["Event", "Seats", "Coming", "Plus-ones coming", "Not coming", "No answer yet"],
        rows: invited.map((row) => [
          EVENT_LABEL[row.event],
          row.seats,
          row.coming,
          row.plusOnesComing,
          row.notComing,
          row.noAnswer,
        ]),
      }}
    >
      <Chart
        definition={definition}
        height={190}
        ariaLabel="Seats per event, stacked by answer"
        ariaDescription="Exact values follow the chart."
      />
    </ChartCard>
  );
}
