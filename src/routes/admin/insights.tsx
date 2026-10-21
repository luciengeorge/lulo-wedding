import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useState } from "react";

import type { EngagementRow } from "@/components/admin/engagement-table";
import type { Funnel } from "@/components/admin/funnel-strip";

import { api } from "@/../convex/_generated/api";
import { EngagementTable } from "@/components/admin/engagement-table";
import { NO_EMAIL_INVITES_NOTE, percentOf } from "@/components/admin/funnel-strip";
import { PartyTimelineSheet } from "@/components/admin/party-timeline";
import { Skeleton } from "@/components/ui/skeleton";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/admin/insights")({
  head: () => ({
    meta: seo({
      title: "Insights",
      description: "How the invitations are landing.",
      path: "/admin/insights",
      noPreview: true,
    }),
  }),
  component: InsightsPage,
});

function InsightsPage() {
  const funnel = useQuery(api.admin.funnel, {});
  const engagement = useQuery(api.admin.engagementList, {});
  const [open, setOpen] = useState<EngagementRow | null>(null);

  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-5 sm:px-6">
      <section aria-labelledby="funnel-title" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 id="funnel-title" className="text-[15px] font-semibold">
            Funnel by channel
          </h1>
          <p className="text-[12.5px] text-[#71717A]">
            Counted in parties. Each party is credited to the channel that reached it first. Email opens are a hint, not
            proof: some mail apps open every message on arrival.
          </p>
        </div>
        {funnel === undefined ? (
          <Skeleton className="h-[148px] w-full rounded-[9px]" />
        ) : (
          <ChannelTable funnel={funnel} />
        )}
        <EmailStats funnel={funnel} />
        {funnel?.email.sent === 0 ? <p className="text-[12.5px] text-[#71717A]">{NO_EMAIL_INVITES_NOTE}</p> : null}
      </section>

      <section aria-labelledby="engagement-title" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="engagement-title" className="text-[15px] font-semibold">
            Engagement
          </h2>
          <p className="text-[12.5px] text-[#71717A]">
            Who has opened their invitation, and who has answered. Open a party to see every message and visit.
          </p>
        </div>
        {engagement === undefined ? (
          <Skeleton className="h-[300px] w-full rounded-[9px]" />
        ) : (
          <EngagementTable rows={engagement} onOpen={setOpen} />
        )}
      </section>

      <PartyTimelineSheet party={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/** "12 parties", with the share beside it when there is a base to take it of. */
function Count({ value, of }: { value: number; of?: number }) {
  const percent = of === undefined ? undefined : percentOf(value, of);
  return (
    <span className="whitespace-nowrap" style={{ fontVariantNumeric: "tabular-nums" }}>
      <span className={value === 0 ? "text-[#A1A1AA]" : "font-medium"}>{value}</span>
      <span className="text-[#71717A]"> {value === 1 ? "party" : "parties"}</span>
      {percent ? <span className="text-[#A1A1AA]"> · {percent}</span> : null}
    </span>
  );
}

function ChannelTable({ funnel }: { funnel: Funnel }) {
  const rows = [
    { label: "Email first", ...funnel.byFirstChannel.email },
    { label: "WhatsApp first", ...funnel.byFirstChannel.whatsapp },
  ];
  const notSent = funnel.parties - funnel.invited.any;

  return (
    <div className="overflow-x-auto rounded-[9px] border border-[#E4E4E7]">
      <table className="w-full min-w-[620px] border-collapse text-[13px]">
        <thead>
          <tr className="h-[38px] bg-[#FAFAFA] text-left text-[11px] font-medium tracking-[0.03em] text-[#71717A] uppercase">
            <th scope="col" className="px-3.5 font-medium">
              Channel
            </th>
            <th scope="col" className="px-3.5 font-medium">
              Invited
            </th>
            <th scope="col" className="px-3.5 font-medium">
              Seen link
            </th>
            <th scope="col" className="px-3.5 font-medium">
              Replied
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="h-[44px] border-b border-[#F4F4F5]">
              <th scope="row" className="px-3.5 text-left font-normal">
                {row.label}
              </th>
              <td className="px-3.5">
                <Count value={row.parties} />
              </td>
              <td className="px-3.5">
                <Count value={row.visited} of={row.parties} />
              </td>
              <td className="px-3.5">
                <Count value={row.replied} of={row.parties} />
              </td>
            </tr>
          ))}
          <tr className="h-[44px] bg-[#FCFCFC]">
            <th scope="row" className="px-3.5 text-left font-medium">
              Whole list
            </th>
            <td className="px-3.5">
              <Count value={funnel.parties} />
              {notSent > 0 ? <span className="text-[#A1A1AA]"> · {notSent} not sent yet</span> : null}
            </td>
            <td className="px-3.5">
              <Count value={funnel.visited} of={funnel.parties} />
            </td>
            <td className="px-3.5">
              <Count value={funnel.replied} of={funnel.parties} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Where the emailed invitations got to, each step as a share of those emailed. */
function EmailStats({ funnel }: { funnel: Funnel | undefined }) {
  const emailed = funnel?.invited.email ?? 0;
  const steps = funnel
    ? [
        { label: "Emailed", value: funnel.invited.email },
        { label: "Delivered", value: funnel.email.delivered, of: emailed },
        { label: "Opened", value: funnel.email.opened, of: emailed },
        { label: "Clicked", value: funnel.email.clicked, of: emailed },
        { label: "Bounced", value: funnel.email.bounced, of: emailed, alarm: true },
        { label: "Marked as spam", value: funnel.email.complained, of: emailed, alarm: true },
      ]
    : [];

  return (
    <div className="flex flex-wrap gap-x-7 gap-y-3 rounded-[9px] border border-[#E4E4E7] px-3.5 py-3">
      {funnel === undefined
        ? Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-9 w-20" />)
        : steps.map((step) => (
            <div key={step.label} className="flex flex-col gap-0.5">
              <span className="text-[12px] text-[#71717A]">{step.label}</span>
              <span className="text-[13px]">
                {step.alarm && step.value > 0 ? (
                  <span className="text-[#9F1239]">
                    <Count value={step.value} of={step.of} />
                  </span>
                ) : (
                  <Count value={step.value} of={step.of} />
                )}
              </span>
            </div>
          ))}
    </div>
  );
}
