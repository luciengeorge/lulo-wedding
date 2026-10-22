import { barX, defineChart, text } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { useMemo, useState } from "react";

import type { GroupRate } from "@/lib/dashboard";

import { LINK_LABEL, WAVE_LABEL, WHO_LONG_LABEL } from "@/lib/party-labels";
import { cn } from "@/lib/utils";

import { ChartCard } from "./chart-card";
import { percent } from "./format";
import { bottomLegend } from "./legend";

type Dimension = "who" | "link" | "wave" | "whereFrom";

const DIMENSIONS: readonly { key: Dimension; label: string }[] = [
  { key: "who", label: "Side" },
  { key: "link", label: "Family / friends" },
  { key: "wave", label: "Wave" },
  { key: "whereFrom", label: "Where from" },
];

const LABELS: Record<Dimension, Record<string, string>> = {
  who: WHO_LONG_LABEL,
  link: LINK_LABEL,
  wave: WAVE_LABEL,
  whereFrom: {},
};

const SERIES = ["Replied", "Coming"] as const;

type Props = { groups: Record<Dimension, readonly GroupRate[]> };

const share = (part: number, whole: number) => (whole === 0 ? 0 : (part / whole) * 100);
const labelFor = (dimension: Dimension, group: string) => LABELS[dimension][group] ?? group;

/**
 * Which groups are answering, as a share of the parties asked (invited, or
 * answered anyway). Coming is a subset of replied, so it is drawn inside the
 * replied bar rather than beside it.
 */
export function GroupRatesChart({ groups }: Props) {
  const [dimension, setDimension] = useState<Dimension>("who");
  const rows = groups[dimension].filter((row) => row.base > 0);
  const labelOf = (group: string) => labelFor(dimension, group);

  const definition = useMemo(() => {
    const bars = rows.map((row) => ({
      group: labelFor(dimension, row.group),
      replied: share(row.replied, row.base),
      coming: share(row.coming, row.base),
      label: `${percent(row.replied, row.base)} of ${row.base}`,
    }));
    return defineChart({
      marks: [
        barX(bars, { x1: 0, x2: "replied", y: "group", color: () => SERIES[0], radius: { end: 3 } }),
        barX(bars, { x1: 0, x2: "coming", y: "group", color: () => SERIES[1], inset: 4, radius: { end: 2 } }),
        text(bars, { x: "replied", y: "group", text: "label", anchor: "start", dx: 6, fill: "var(--foreground)" }),
      ],
      scales: {
        x: {
          scale: scaleLinear().domain([0, 100]),
          grid: true,
          axis: {
            label: "% of parties asked",
            ticks: { format: (value: number) => `${value}%`, values: [0, 25, 50, 75, 100] },
          },
        },
        y: { scale: () => scaleBand<string>().padding(0.28), axis: { ticks: { size: 0 } } },
      },
      color: {
        domain: [...SERIES],
        range: ["var(--viz-soft)", "var(--viz-ink)"],
        legend: bottomLegend(),
      },
      focus: "nearest-y",
      tooltip,
    });
  }, [rows, dimension]);

  const best = rows[0];
  const worst = rows.at(-1);

  return (
    <ChartCard
      title="Reply rate by group"
      question="Which groups are answering, and which to chase."
      toolbar={
        <div role="group" aria-label="Group by" className="flex flex-wrap gap-1">
          {DIMENSIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={dimension === option.key}
              onClick={() => setDimension(option.key)}
              className={cn(
                "h-7 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:text-foreground",
                dimension === option.key && "border-foreground/20 bg-muted font-medium text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      }
      empty={
        rows.length === 0
          ? { title: "No one asked yet", hint: "Rates appear once invitations go out or parties reply." }
          : undefined
      }
      summary={
        best && worst ? (
          <p>
            Highest: <span className="font-medium text-foreground">{labelOf(best.group)}</span>,{" "}
            {percent(best.replied, best.base)} replied of {best.base}.
            {worst !== best ? (
              <>
                {" "}
                Lowest: <span className="font-medium text-foreground">{labelOf(worst.group)}</span>,{" "}
                {percent(worst.replied, worst.base)} of {worst.base}.
              </>
            ) : null}
          </p>
        ) : null
      }
      table={{
        caption: `Reply rate by ${DIMENSIONS.find((option) => option.key === dimension)?.label.toLowerCase()}`,
        columns: ["Group", "Parties asked", "Replied", "Coming"],
        rows: rows.map((row) => [
          labelOf(row.group),
          row.base,
          `${row.replied} (${percent(row.replied, row.base)})`,
          `${row.coming} (${percent(row.coming, row.base)})`,
        ]),
      }}
    >
      <Chart
        definition={definition}
        height={Math.max(150, rows.length * 34 + 80)}
        ariaLabel="Share of parties replied and coming, per group"
      />
    </ChartCard>
  );
}
