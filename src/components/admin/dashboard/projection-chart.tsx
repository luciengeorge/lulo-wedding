import { barX, defineChart, text } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { useMemo } from "react";

import type { EventProjection } from "@/lib/dashboard";

import { ChartCard } from "./chart-card";
import { EVENT_LABEL, formatCount, plural } from "./format";
import { bottomLegend } from "./legend";

const SERIES = ["Confirmed", "Projected", "If everyone left says yes"] as const;
const PAINT = ["var(--viz-ink)", "var(--viz-ink-soft)", "var(--viz-soft)"];

type Props = {
  events: readonly EventProjection[];
  shown: boolean;
  replies: number;
  minReplies: number;
};

/**
 * Confirmed headcount, and where it is heading. The projection applies each
 * event's yes-rate so far to the seats still to answer; with only a handful of
 * replies that rate is noise, so the projected bar waits for `minReplies`.
 */
export function ProjectionChart({ events, shown, replies, minReplies }: Props) {
  const rows = events.filter((row) => row.confirmed + row.pending + row.answered > 0);
  const definition = useMemo(() => {
    const bars = rows.map((row) => ({
      event: EVENT_LABEL[row.event],
      confirmed: row.confirmed,
      projected: shown ? (row.projected ?? row.confirmed) : row.confirmed,
      ceiling: row.confirmed + row.pending,
      label:
        shown && row.projected !== undefined
          ? `${formatCount(row.confirmed)} → ~${formatCount(row.projected)}`
          : formatCount(row.confirmed),
    }));
    return defineChart({
      marks: [
        barX(bars, {
          x1: 0,
          x2: "ceiling",
          y: "event",
          color: () => SERIES[2],
          radius: { end: 3 },
        }),
        ...(shown
          ? [
              barX(bars, {
                x1: 0,
                x2: "projected",
                y: "event",
                color: () => SERIES[1],
                inset: 3,
                radius: { end: 3 },
              }),
            ]
          : []),
        barX(bars, { x1: 0, x2: "confirmed", y: "event", color: () => SERIES[0], inset: 6, radius: { end: 3 } }),
        text(bars, { x: "ceiling", y: "event", text: "label", anchor: "start", dx: 6, fill: "var(--foreground)" }),
      ],
      scales: {
        x: { scale: scaleLinear, nice: true, grid: true, axis: { label: "People" } },
        y: { scale: () => scaleBand<string>().padding(0.3), axis: { ticks: { size: 0 } } },
      },
      color: {
        domain: shown ? [...SERIES] : [SERIES[0], SERIES[2]],
        range: shown ? PAINT : [PAINT[0], PAINT[2]],
        legend: bottomLegend(),
      },
      tooltip,
    });
  }, [rows, shown]);

  return (
    <ChartCard
      title="Projected headcount"
      question="How many people to expect at each event, if the rest answer the way replies have so far."
      empty={
        rows.length === 0
          ? { title: "No one invited yet", hint: "Headcount appears once parties are invited." }
          : undefined
      }
      toolbar={
        <p className="text-[12px] text-muted-foreground">
          {shown
            ? "Projected = confirmed + seats still to answer × each event's yes-rate so far. Confirmed includes plus-ones."
            : `The projection appears after ${minReplies} replies (${formatCount(replies)} so far). Until then, only confirmed numbers.`}
        </p>
      }
      summary={
        <ul className="flex flex-col gap-0.5">
          {rows.map((row) => (
            <li key={row.event}>
              <span className="font-medium text-foreground">{EVENT_LABEL[row.event]}</span>:{" "}
              {formatCount(row.confirmed)} confirmed
              {shown && row.projected !== undefined && row.yesRate !== undefined
                ? `, projected ~${formatCount(row.projected)} at a ${Math.round(row.yesRate * 100)}% yes-rate`
                : ""}
              , {plural(row.pending, "seat")} still to answer.
            </li>
          ))}
        </ul>
      }
      table={{
        caption: "Projected headcount per event",
        columns: ["Event", "Confirmed", "Still to answer", "Yes-rate so far", "Projected"],
        rows: rows.map((row) => [
          EVENT_LABEL[row.event],
          row.confirmed,
          row.pending,
          row.yesRate === undefined ? "–" : `${Math.round(row.yesRate * 100)}%`,
          shown && row.projected !== undefined ? row.projected : "Not enough replies",
        ]),
      }}
    >
      <Chart definition={definition} height={190} ariaLabel="Confirmed and projected headcount per event" />
    </ChartCard>
  );
}
