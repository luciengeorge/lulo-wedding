import type { InvitationEmailProps } from "./_invitation";

import { Greeting, InvitationDetails, Paragraph } from "./_invitation";
import { EmailLayout } from "./_layout";

/** The invitation itself, one per party, with that party's own link and events. */
export default function InviteEmail({ displayName, ...details }: InvitationEmailProps) {
  return (
    <EmailLayout preview="We are getting married, and we would love you to be there.">
      <Greeting displayName={displayName} />
      <Paragraph>We are getting married in Lebanon, and we would love you to be there.</Paragraph>
      <Paragraph>You are invited to:</Paragraph>
      <InvitationDetails {...details} />
    </EmailLayout>
  );
}
