import type { ReactNode } from "react";

import { Body, Container, Head, Hr, Html, Img, Link, Preview, Section, Tailwind, Text } from "react-email";

import { MONOGRAM_CID } from "../monogram";
import { supportEmail } from "./_components";

interface EmailLayoutProps {
  preview: string;
  appName?: string;
  children: ReactNode;
}

/**
 * Shared layout for all transactional emails. Email-safe HTML via React Email's
 * Tailwind wrapper (transforms classes to inline styles for Gmail/Outlook/etc).
 *
 * Branding via env vars (all optional):
 * - EMAIL_LOGO_URL — header logo image (falls back to app-name text)
 * - APP_NAME       — product name used in header + footer
 * - SUPPORT_EMAIL  — surfaced in footer for help
 *
 * Container uses a fluid max-width so it shrinks gracefully on mobile.
 */
export function EmailLayout({ preview, appName, children }: EmailLayoutProps) {
  const name = appName ?? process.env.APP_NAME ?? "Laura & Lucien";
  const logoUrl = process.env.EMAIL_LOGO_URL;
  const support = supportEmail();

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        {/* Georgia, not the display faces from the site: Gmail strips webfonts,
            and a serif that is actually installed everywhere reads closer to the
            invitation than a sans fallback would. */}
        <Body
          className="m-0 p-0"
          style={{ backgroundColor: "#F3E9DA", fontFamily: "Georgia, 'Times New Roman', serif" }}
        >
          <Container
            className="mx-auto my-8 w-full max-w-[560px] px-8 py-10"
            style={{ backgroundColor: "#F9F1E5", borderRadius: 4, border: "1px solid #E7D9C4" }}
          >
            {/* Most clients block remote images by default, so the header must
                read correctly with the image missing. The monogram is decorative
                with an empty alt — a broken-image icon plus wrapping alt text is
                worse than no image — and the couple's name is real text
                underneath, which always renders. It is attached to the message
                (convex/email/monogram.ts), not fetched, so it shows even where
                remote images are blocked. */}
            <Section className="mb-7" style={{ textAlign: "center" }}>
              <Img
                src={logoUrl ?? `cid:${MONOGRAM_CID}`}
                alt=""
                width="44"
                height="44"
                style={{ display: "inline-block", border: "none", outline: "none" }}
              />
              <Text className="m-0" style={{ fontSize: 15, letterSpacing: "0.08em", color: "#9B0D17", paddingTop: 6 }}>
                {name}
              </Text>
            </Section>

            {children}

            <Hr className="my-8" style={{ borderColor: "#E0CDB2" }} />

            <Section>
              <Text className="m-0 text-xs leading-5" style={{ color: "#8A7867" }}>
                You are receiving this because you are on the guest list for {name}.
                {support ? (
                  <>
                    {" "}
                    Questions? Reach us at{" "}
                    <Link href={`mailto:${support}`} style={{ color: "#9B0D17" }}>
                      {support}
                    </Link>
                    .
                  </>
                ) : null}
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
