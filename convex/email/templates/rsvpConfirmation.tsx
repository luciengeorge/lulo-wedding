import { Heading, Hr, Link, Text } from "react-email";

import { Signoff } from "./_components";
import { EmailLayout } from "./_layout";

interface RsvpEvent {
  label: string;
  date: string;
  attending: string[];
}

interface RsvpConfirmationEmailProps {
  displayName: string;
  declined: boolean;
  events: RsvpEvent[];
  seatsNamed: number;
  headCount: number;
  rsvpUrl: string;
}

/** "Rae, Cherif and Nour", because a wedding email should not read like a CSV. */
function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export default function RsvpConfirmationEmail({
  displayName,
  declined,
  events,
  seatsNamed,
  headCount,
  rsvpUrl,
}: RsvpConfirmationEmailProps) {
  // Grouped by event rather than by guest: this is the copy someone opens six
  // months later to check which days they said yes to.
  return (
    <EmailLayout preview={declined ? "We got your reply" : `Your reply for ${displayName}`}>
      <Heading className="mt-0 mb-4 text-2xl font-bold text-gray-900">
        {declined ? "We got your reply" : "Thank you"}
      </Heading>

      {declined ? (
        <Text className="text-base leading-6 text-gray-700">
          You have let us know you cannot make it. We will miss you, and if anything changes you can still change your
          answer using the link below.
        </Text>
      ) : (
        <Text className="text-base leading-6 text-gray-700">
          Here is what we have written down for {displayName}. Nothing is final: you can change any of it using the link
          below.
        </Text>
      )}

      {declined ? null : (
        <>
          <Hr className="my-5 border-gray-200" />
          {events.map((event) => (
            <Text key={event.label} className="my-3 text-base leading-6 text-gray-700">
              <strong className="text-gray-900">{event.label}</strong>
              <br />
              {event.date}
              <br />
              {event.attending.length > 0 ? list(event.attending) : "Nobody, this time"}
            </Text>
          ))}
          <Hr className="my-5 border-gray-200" />

          {/* A party can reply for some seats now and the rest later, so a partial
              reply has to say so or it reads as finished. */}
          {seatsNamed < headCount ? (
            <Text className="text-base leading-6 text-gray-700">
              You have told us about {seatsNamed} of your {headCount} places. If someone else is coming, add them
              whenever you know.
            </Text>
          ) : null}
        </>
      )}

      <Text className="text-base leading-6 text-gray-700">
        <Link href={rsvpUrl} className="text-[#9B0D17] underline">
          Change your reply
        </Link>
      </Text>

      <Signoff />
    </EmailLayout>
  );
}
