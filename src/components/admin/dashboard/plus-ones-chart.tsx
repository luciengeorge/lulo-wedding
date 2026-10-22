import { barX, defineChart, text } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { useMemo } from "react";

import { ChartCard } from "./chart-card";
import { formatCount, plural } from "./format";

type Props = {
  plusOnes: { allowed: number; named: number; coming: number };
  dietary: readonly { name: string; note: string }[];
};

/**
 * The two things a caterer asks after the headcount. Plus-ones run from
 * offered to named to coming; dietary notes are listed by name, only for
 * guests who are coming, behind a disclosure so the card stays short.
 */
export function PlusOnesChart({ plusOnes, dietary }: Props) {
  const definition = useMemo(() => {
    const rows = [
      { step: "Allowed", count: plusOnes.allowed, paint: "var(--viz-soft)" },
      { step: "Named", count: plusOnes.named, paint: "var(--viz-neutral)" },
      { step: "Coming", count: plusOnes.coming, paint: "var(--viz-ink)" },
    ];
    return defineChart({
      marks: [
        barX(rows, { x: "count", y: "step", fill: (row) => row.paint, radius: { end: 3 } }),
        text(rows, {
          x: "count",
          y: "step",
          text: (row) => formatCount(row.count),
          anchor: "start",
          dx: 6,
          fill: "var(--foreground)",
        }),
      ],
      scales: {
        x: { scale: scaleLinear, nice: true, grid: true, axis: { label: "Plus-ones" } },
        y: { scale: () => scaleBand<string>().padding(0.3), axis: { ticks: { size: 0 } } },
      },
      tooltip,
    });
  }, [plusOnes]);

  return (
    <ChartCard
      title="Plus-ones & dietary needs"
      question="How many plus-ones were offered, named and are coming, and who needs a special meal."
      empty={
        plusOnes.allowed === 0 && plusOnes.named === 0
          ? { title: "No plus-ones offered", hint: "No invitation includes a plus-one yet." }
          : undefined
      }
      summary={
        <p>
          {plural(plusOnes.allowed, "plus-one")} allowed, {formatCount(plusOnes.named)} named,{" "}
          {formatCount(plusOnes.coming)} coming.
        </p>
      }
      table={{
        caption: "Plus-ones",
        columns: ["Step", "Plus-ones"],
        rows: [
          ["Allowed", plusOnes.allowed],
          ["Named", plusOnes.named],
          ["Coming", plusOnes.coming],
        ],
      }}
      footer={<DietaryNotes dietary={dietary} />}
    >
      <Chart definition={definition} height={150} ariaLabel="Plus-ones allowed, named and coming" />
    </ChartCard>
  );
}

function DietaryNotes({ dietary }: { dietary: Props["dietary"] }) {
  if (dietary.length === 0) {
    return (
      <p data-slot="dietary" className="border-t border-border pt-3 text-[12.5px] text-muted-foreground">
        No dietary notes from guests who are coming yet.
      </p>
    );
  }
  return (
    <details data-slot="dietary" className="group border-t border-border pt-3 text-[12.5px]">
      <summary className="cursor-pointer text-foreground/80 marker:text-muted-foreground">
        <span className="font-medium text-foreground">{plural(dietary.length, "guest")}</span> coming with dietary notes
      </summary>
      <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
        {dietary.map((guest, index) => (
          <li key={`${guest.name}-${index}`} className="flex flex-wrap gap-x-2">
            <span className="font-medium">{guest.name}</span>
            <span className="text-muted-foreground">{guest.note}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
