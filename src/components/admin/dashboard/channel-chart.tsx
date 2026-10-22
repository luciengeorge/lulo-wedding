import { barY, defineChart, group } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { useMemo } from "react";

import type { ChannelFunnel } from "@/lib/dashboard";

import { ChartCard } from "./chart-card";
import { formatCount, percent } from "./format";
import { bottomLegend } from "./legend";

const CHANNELS = ["Email first", "WhatsApp first"] as const;
const STAGES = ["Invited", "Seen", "Replied"] as const;

type Props = { email: ChannelFunnel; whatsapp: ChannelFunnel };

function steps(funnel: ChannelFunnel) {
  return [funnel.parties, funnel.visited, funnel.replied] as const;
}

/**
 * Which channel converts, credited to whichever invite reached each party
 * first, the same split as the strip on Insights. Shares are of that channel's
 * invited parties.
 */
export function ChannelChart({ email, whatsapp }: Props) {
  const definition = useMemo(() => {
    const rows = [
      ...STAGES.map((stage, index) => ({ stage, channel: CHANNELS[0], parties: steps(email)[index] })),
      ...STAGES.map((stage, index) => ({ stage, channel: CHANNELS[1], parties: steps(whatsapp)[index] })),
    ];
    return defineChart({
      marks: [
        barY(rows, {
          x: "stage",
          y: "parties",
          color: "channel",
          layout: group({ padding: 0.12 }),
          radius: { end: 3 },
        }),
      ],
      scales: {
        x: { scale: () => scaleBand<string>().padding(0.25), axis: { ticks: { size: 0 } } },
        y: { scale: scaleLinear, nice: true, grid: true, axis: { label: "Parties", ticks: { count: 4 } } },
      },
      color: {
        domain: [...CHANNELS],
        range: ["var(--viz-1)", "var(--viz-3)"],
        legend: bottomLegend(),
      },
      focus: "group-x",
      tooltip,
    });
  }, [email, whatsapp]);

  const line = (label: string, funnel: ChannelFunnel) => (
    <li>
      <span className="font-medium text-foreground">{label}</span>: {formatCount(funnel.parties)} invited →{" "}
      {formatCount(funnel.visited)} seen ({percent(funnel.visited, funnel.parties)}) → {formatCount(funnel.replied)}{" "}
      replied ({percent(funnel.replied, funnel.parties)}).
    </li>
  );

  return (
    <ChartCard
      title="Funnel by channel"
      question="Whether email or WhatsApp invitations get seen and answered more."
      empty={
        email.parties + whatsapp.parties === 0
          ? { title: "No invitations sent yet", hint: "Each party counts under the channel that reached it first." }
          : undefined
      }
      summary={
        <ul className="flex flex-col gap-0.5">
          {line(CHANNELS[0], email)}
          {line(CHANNELS[1], whatsapp)}
        </ul>
      }
      table={{
        caption: "Parties per stage, by first channel",
        columns: ["Channel", ...STAGES],
        rows: [
          [CHANNELS[0], ...steps(email)],
          [CHANNELS[1], ...steps(whatsapp)],
        ],
      }}
    >
      <Chart definition={definition} height={220} ariaLabel="Parties invited, seen and replied, by first channel" />
    </ChartCard>
  );
}
