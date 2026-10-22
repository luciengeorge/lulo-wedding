import type { FunctionReturnType } from "convex/server";

import type { api } from "@/../convex/_generated/api";

import { ChannelChart } from "./channel-chart";
import { EmailHealthChart } from "./email-health-chart";
import { GroupRatesChart } from "./group-rates-chart";
import { PlusOnesChart } from "./plus-ones-chart";
import { ProjectionChart } from "./projection-chart";
import { RepliesChart } from "./replies-chart";
import { SeatsChart } from "./seats-chart";
import { TimeToReplyChart } from "./time-to-reply-chart";
import { VisitsChart } from "./visits-chart";

export type DashboardData = FunctionReturnType<typeof api.admin.dashboard>;

/** The nine charts, in the order the couple read them: who is coming, then how the asking is going. */
export function DashboardCharts({ data }: { data: DashboardData }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SeatsChart rows={data.seats} />
      <ProjectionChart
        events={data.projection.events}
        shown={data.projection.shown}
        replies={data.replies}
        minReplies={data.projection.minReplies}
      />
      <PlusOnesChart plusOnes={data.plusOnes} dietary={data.dietary} />
      <RepliesChart
        days={data.repliesOverTime.days}
        campaigns={data.repliesOverTime.campaigns}
        undatedDeclines={data.repliesOverTime.undatedDeclines}
      />
      <GroupRatesChart groups={data.groups} />
      <TimeToReplyChart
        bins={data.timeToReply.bins}
        medianDays={data.timeToReply.medianDays}
        unprompted={data.timeToReply.unprompted}
      />
      <ChannelChart email={data.channels.email} whatsapp={data.channels.whatsapp} />
      <EmailHealthChart campaigns={data.campaigns} />
      <VisitsChart days={data.visits.days} total={data.visits.total} earlierDays={data.visits.earlierDays} />
    </div>
  );
}
