import { Button, Section, Text } from "react-email";

export interface InvitationEmailProps {
  displayName: string;
  events: { label: string; date: string }[];
  rsvpUrl: string;
  replyBy?: string;
}

const INK = "#9B0D17";
const BODY = { color: "#3F3127", fontSize: 16, lineHeight: "26px" } as const;

export function Greeting({ displayName }: { displayName: string }) {
  return (
    <Text className="mt-0 mb-4" style={BODY}>
      {`Dear ${displayName},`}
    </Text>
  );
}

export function Paragraph({ children }: { children: string }) {
  return (
    <Text className="my-4" style={BODY}>
      {children}
    </Text>
  );
}

/**
 * The events, the reply button and the sign-off: the part of an invitation and
 * a reminder that is the same. Only the opening lines differ between them.
 */
export function InvitationDetails({ events, rsvpUrl, replyBy }: Omit<InvitationEmailProps, "displayName">) {
  return (
    <>
      <Section className="my-6" style={{ borderTop: "1px solid #E0CDB2", borderBottom: "1px solid #E0CDB2" }}>
        {events.map((event) => (
          <Text key={event.label} className="my-4" style={{ ...BODY, textAlign: "center" }}>
            <span style={{ color: INK, fontSize: 18, letterSpacing: "0.04em" }}>{event.label}</span>
            <br />
            {event.date}
          </Text>
        ))}
      </Section>

      <Text className="my-4" style={{ ...BODY, textAlign: "center", color: "#6F5E50", fontSize: 15 }}>
        Venues and times will be on the site soon.
      </Text>

      <Section className="my-7" style={{ textAlign: "center" }}>
        <Button
          href={rsvpUrl}
          style={{
            backgroundColor: INK,
            color: "#F9F1E5",
            borderRadius: 3,
            padding: "13px 26px",
            fontSize: 15,
            letterSpacing: "0.04em",
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Reply to our invitation
        </Button>
      </Section>

      {replyBy ? (
        <Text className="my-4" style={{ ...BODY, textAlign: "center" }}>
          {`Please reply by ${replyBy}.`}
        </Text>
      ) : null}

      <Text className="mt-8 mb-0" style={BODY}>
        With love,
        <br />
        Laura &amp; Lucien
      </Text>
    </>
  );
}
