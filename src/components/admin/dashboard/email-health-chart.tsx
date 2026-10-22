import { barX, defineChart, group } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { useMemo } from "react";

import type { CampaignHealth } from "@/lib/dashboard";

import { ChartCard } from "./chart-card";
import { formatCount, plural } from "./format";
import { bottomLegend } from "./legend";

const METRICS = [
  { key: "delivered", label: "Delivered", paint: "var(--viz-seq-1)" },
  { key: "opened", label: "Opened (soft)", paint: "var(--viz-seq-2)" },
  { key: "clicked", label: "Clicked", paint: "var(--viz-seq-3)" },
  { key: "bounced", label: "Bounced", paint: "var(--viz-bad)" },
  { key: "failed", label: "Failed", paint: "var(--viz-warn)" },
] as const;

const KIND_LABEL = { invite: "Invites", reminder: "Reminder" } as const;

export function runLabel(run: Pick<CampaignHealth, "kind" | "createdAt">): string {
  const day = new Date(run.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${KIND_LABEL[run.kind]} · ${day}`;
}

/**
 * Each send run from the composer, read off its own messages. Opens are a
 * soft signal: some mail apps open every email the moment it lands.
 */
export function EmailHealthChart({ campaigns }: { campaigns: readonly CampaignHealth[] }) {
  // Two runs on one day still need distinct rows.
  const labels = campaigns.map((run, _index, all) => {
    const label = runLabel(run);
    const same = all.filter((other) => runLabel(other) === label);
    return same.length > 1 ? `${label} (${same.indexOf(run) + 1})` : label;
  });

  const definition = useMemo(() => {
    const rows = campaigns.flatMap((run, index) =>
      METRICS.map((metric) => ({ run: labels[index], metric: metric.label, emails: run[metric.key], sent: run.sent })),
    );
    return defineChart({
      marks: [
        barX(rows, { x: "emails", y: "run", color: "metric", layout: group({ padding: 0.08 }), radius: { end: 2 } }),
      ],
      scales: {
        x: { scale: scaleLinear, nice: true, grid: true, axis: { label: "Emails", ticks: { count: 4 } } },
        y: { scale: () => scaleBand<string>().padding(0.22), axis: { ticks: { size: 0 } } },
      },
      color: {
        domain: METRICS.map((metric) => metric.label),
        range: METRICS.map((metric) => metric.paint),
        legend: bottomLegend(),
      },
      focus: "group-y",
      tooltip,
    });
  }, [campaigns, labels]);

  return (
    <ChartCard
      title="Email health per send run"
      question="Whether each run of invitations or reminders landed, and how many bounced or failed."
      empty={
        campaigns.length === 0
          ? { title: "No emails sent yet", hint: "Runs started from the email composer show up here." }
          : undefined
      }
      toolbar={
        campaigns.length > 0 ? (
          <p className="text-[12px] text-muted-foreground">
            Opens are soft: some mail apps open every email on arrival.
          </p>
        ) : null
      }
      summary={
        <ul className="flex flex-col gap-0.5">
          {campaigns.map((run, index) => (
            <li key={labels[index]}>
              <span className="font-medium text-foreground">{labels[index]}</span>: {plural(run.sent, "email")},{" "}
              {formatCount(run.delivered)} delivered, {formatCount(run.opened)} opened, {formatCount(run.clicked)}{" "}
              clicked, {formatCount(run.bounced)} bounced, {formatCount(run.failed)} failed
              {run.complained > 0 ? `, ${formatCount(run.complained)} marked as spam` : ""}.
            </li>
          ))}
        </ul>
      }
      table={{
        caption: "Email outcomes per send run",
        columns: ["Run", "Sent", ...METRICS.map((metric) => metric.label), "Marked as spam"],
        rows: campaigns.map((run, index) => [
          labels[index],
          run.sent,
          ...METRICS.map((metric) => run[metric.key]),
          run.complained,
        ]),
      }}
    >
      <Chart
        definition={definition}
        height={Math.max(180, campaigns.length * 70 + 90)}
        ariaLabel="Delivered, opened, clicked, bounced and failed emails per send run"
      />
    </ChartCard>
  );
}
