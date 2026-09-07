import type { ReactNode } from "react";

import { Button, Section, Text } from "@react-email/components";

/**
 * Shared email building blocks. Keep brand-specific values in env vars so the
 * template stays generic across products:
 *
 * - BRAND_COLOR   — hex for buttons + accents (default near-black)
 * - SUPPORT_EMAIL — reply-to / help address (falls back to RESEND_FROM_EMAIL)
 * - EMAIL_SIGNOFF — signature line, e.g. "— Lucien, founder of MyApp"
 */

export function brandColor(): string {
  return process.env.BRAND_COLOR ?? "#0a0a0a";
}

export function supportEmail(): string | undefined {
  return process.env.SUPPORT_EMAIL ?? process.env.RESEND_FROM_EMAIL;
}

/** Primary CTA button, themed by BRAND_COLOR. Pass `destructive` for red. */
export function BrandButton({
  href,
  children,
  destructive = false,
}: {
  href: string;
  children: ReactNode;
  destructive?: boolean;
}) {
  return (
    <Section className="my-7 text-center">
      <Button
        href={href}
        style={{ backgroundColor: destructive ? "#dc2626" : brandColor() }}
        className="inline-block rounded-lg px-6 py-3 text-sm font-semibold text-white no-underline"
      >
        {children}
      </Button>
    </Section>
  );
}

/** Fallback URL block shown under CTAs for clients that strip buttons. */
export function FallbackUrl({ url }: { url: string }) {
  return (
    <Text className="text-sm leading-5 text-gray-500">
      Or paste this link into your browser:
      <br />
      <a href={url} className="break-all text-gray-700">
        {url}
      </a>
    </Text>
  );
}

/**
 * Security panel for sensitive emails (password reset, account deletion,
 * email change). Gives the user clear steps if the request wasn't theirs.
 */
export function SecurityNotice({ action }: { action: string }) {
  const support = supportEmail();
  return (
    <Section className="my-6 rounded-lg border border-solid border-gray-200 bg-gray-50 px-4 py-3">
      <Text className="m-0 text-sm font-semibold text-gray-900">Didn't request this?</Text>
      <Text className="mt-1 mb-0 text-sm leading-5 text-gray-600">
        If you didn't {action}, you can safely ignore this email. For your security, consider changing your password
        {support ? (
          <>
            {" "}
            and emailing{" "}
            <a href={`mailto:${support}`} className="text-gray-700">
              {support}
            </a>
          </>
        ) : null}{" "}
        if you think someone has access to your account.
      </Text>
    </Section>
  );
}

/** Sign-off line. Renders only if EMAIL_SIGNOFF is set. */
export function Signoff() {
  const signoff = process.env.EMAIL_SIGNOFF;
  if (!signoff) return null;
  return <Text className="mt-6 text-base leading-6 text-gray-700">{signoff}</Text>;
}
