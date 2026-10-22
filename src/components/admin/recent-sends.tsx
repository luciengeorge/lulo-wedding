import { useQuery } from "convex/react";

import { api } from "@/../convex/_generated/api";

import { partyCount, progressText, StopButton } from "./email-composer";
import { RelativeTime } from "./relative-time";

const KIND_LABEL = { invite: "Invitation", reminder: "Reminder" } as const;
/** Enough to see the run in progress and the one before. Older runs live on each party's timeline. */
const SHOWN = 3;

/** The latest email runs from the composer, with their progress and a way to stop one. */
export function RecentSends() {
  const campaigns = useQuery(api.admin.campaigns, {});
  if (!campaigns || campaigns.length === 0) return null;

  return (
    <section
      aria-label="Recent sends"
      className="flex flex-col gap-1.5 rounded-[9px] border border-[#E4E4E7] px-3 py-2 text-[12.5px]"
    >
      <h2 className="text-[12px] text-[#71717A]">Recent sends</h2>
      <ul className="flex flex-col gap-1.5">
        {campaigns.slice(0, SHOWN).map((campaign) => (
          <li
            key={campaign.campaignId}
            className="flex flex-wrap items-center gap-x-3 gap-y-1"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            <span className="font-medium">
              {KIND_LABEL[campaign.kind]} to {partyCount(campaign.total)}
            </span>
            <RelativeTime at={campaign.createdAt} className="text-[#71717A]" />
            <span className={campaign.failed > 0 ? "text-[#9F1239]" : "text-[#52525B]"}>{progressText(campaign)}</span>
            {campaign.status === "sending" ? <StopButton campaignId={campaign.campaignId} className="h-7" /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
