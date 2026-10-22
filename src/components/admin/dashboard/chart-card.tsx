import type { ReactNode } from "react";

import { useId } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type SummaryTable = {
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly (string | number)[])[];
};

type ChartCardProps = {
  title: string;
  /** One line: the question the chart answers. */
  question: string;
  /** Set when there is nothing to plot yet; replaces the chart and its summary. */
  empty?: { title: string; hint?: string };
  /** Plain-language reading of the chart, visible under it. */
  summary?: ReactNode;
  /** The exact values, for screen readers. */
  table?: SummaryTable;
  /** Sits between the heading and the chart: a control, a caveat. */
  toolbar?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
};

/**
 * One chart on the dashboard: heading, the question it answers, the chart, and
 * the same numbers again as text. The heading names the region, so a test or a
 * screen reader can find "Seats per event" without counting cards.
 */
export function ChartCard({
  title,
  question,
  empty,
  summary,
  table,
  toolbar,
  footer,
  children,
  className,
}: ChartCardProps) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn("relative flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4", className)}
    >
      <header className="flex flex-col gap-0.5">
        <h2 id={id} className="text-[13.5px] font-semibold">
          {title}
        </h2>
        <p className="text-[12.5px] text-muted-foreground">{question}</p>
      </header>
      {toolbar}
      {empty ? (
        <EmptyChart title={empty.title} hint={empty.hint} />
      ) : (
        <>
          <div className="viz-chart min-w-0 text-[11px] text-muted-foreground">{children}</div>
          {summary ? (
            <div data-slot="chart-summary" className="text-[12.5px] text-foreground/80">
              {summary}
            </div>
          ) : null}
          {table ? <ScreenReaderTable table={table} /> : null}
        </>
      )}
      {footer}
    </section>
  );
}

/** A dashed frame the height of a chart, so an empty card still reads as a chart waiting for data. */
export function EmptyChart({ title, hint }: { title: string; hint?: string }) {
  return (
    <div
      data-slot="chart-empty"
      className="flex min-h-[180px] flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border px-6 text-center"
    >
      <p className="text-[13px] font-medium text-foreground/80">{title}</p>
      {hint ? <p className="max-w-[34ch] text-[12px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function ScreenReaderTable({ table }: { table: SummaryTable }) {
  return (
    // Wrapped: a table ignores the 1px box sr-only gives it, and would widen the page.
    <div className="sr-only">
      <table>
        <caption>{table.caption}</caption>
        <thead>
          <tr>
            {table.columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={String(row[0])}>
              {row.map((cell, index) =>
                index === 0 ? (
                  <th key={index} scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={index}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3.5 w-64" />
      <Skeleton className="h-[200px] w-full" />
    </div>
  );
}
