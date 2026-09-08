/**
 * Strips secrets out of a URL before it reaches an analytics vendor.
 *
 * `/rsvp/<token>` carries the guest's only credential. There is no password
 * behind it: holding the link is being that party, and the token never expires.
 * Sent verbatim, it lands in Google Analytics and PostHog, where anyone who can
 * read the dashboard, export the data, or breach the vendor can lift a token and
 * open that family's reply.
 *
 * Masked to a route shape instead, so the pageview still counts and the secret
 * stays on the guest's device.
 */
const SECRET_SEGMENTS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /^\/rsvp\/[^/]+/, replacement: "/rsvp/[token]" },
  // better-auth puts one-time tokens in the path on the verification callbacks.
  { pattern: /^\/api\/auth\/.+/, replacement: "/api/auth/[callback]" },
];

export function maskAnalyticsPath(pathname: string): string {
  for (const { pattern, replacement } of SECRET_SEGMENTS) {
    if (pattern.test(pathname)) return pathname.replace(pattern, replacement);
  }
  return pathname;
}

/**
 * The same masking for a full URL.
 *
 * The query string goes entirely: `?redirect=/rsvp/<token>` on the gate carries
 * the same secret, and nothing here needs query parameters to count a pageview.
 */
export function maskAnalyticsUrl(href: string): string {
  try {
    const url = new URL(href);
    return `${url.origin}${maskAnalyticsPath(url.pathname)}`;
  } catch {
    return maskAnalyticsPath(href);
  }
}
