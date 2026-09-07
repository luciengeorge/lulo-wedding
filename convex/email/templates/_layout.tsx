import type { ReactNode } from "react";

import { Body, Container, Head, Hr, Html, Img, Link, Preview, Section, Tailwind, Text } from "@react-email/components";

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
  const name = appName ?? process.env.APP_NAME ?? "Starter Template";
  const logoUrl = process.env.EMAIL_LOGO_URL;
  const support = supportEmail();

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className="m-0 bg-gray-100 p-0 font-sans">
          <Container className="mx-auto my-8 w-full max-w-[560px] rounded-xl bg-white px-8 py-10">
            <Section className="mb-8">
              {logoUrl ? (
                <Img src={logoUrl} alt={name} height="28" className="h-7" />
              ) : (
                <Text className="m-0 text-lg font-bold tracking-tight text-gray-900">{name}</Text>
              )}
            </Section>

            {children}

            <Hr className="my-8 border-gray-200" />

            <Section>
              <Text className="m-0 text-xs leading-5 text-gray-400">
                You received this email because you have an account with {name}.
                {support ? (
                  <>
                    {" "}
                    Questions? Reach us at{" "}
                    <Link href={`mailto:${support}`} className="text-gray-500">
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
