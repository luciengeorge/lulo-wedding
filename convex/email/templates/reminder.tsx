import type { InvitationEmailProps } from "./_invitation";

import { Greeting, InvitationDetails, Paragraph } from "./_invitation";
import { EmailLayout } from "./_layout";

/** A nudge for a party that has not replied, with the same link and events as their invitation. */
export default function ReminderEmail({ displayName, ...details }: InvitationEmailProps) {
  return (
    <EmailLayout preview="We would love to know if you can come.">
      <Greeting displayName={displayName} />
      <Paragraph>
        A small nudge in case our invitation slipped past you. We would love to know if you can come.
      </Paragraph>
      <Paragraph>You are invited to:</Paragraph>
      <InvitationDetails {...details} />
    </EmailLayout>
  );
}
