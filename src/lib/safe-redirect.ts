/** Longer than any route this site has; a redirect this long is an attack, not a link. */
const MAX_LENGTH = 512;

/**
 * Reduces an untrusted `?redirect=` value to a path on this site, or to the fallback.
 *
 * The gate takes the target from the URL, so without this it is an open redirect:
 * a guest could be sent `/enter?redirect=https://evil.example/login`, type the real
 * password, and be handed to a copy of the site. Wedding guests are exactly the
 * audience for that, since the link arrives over WhatsApp from someone they trust
 * and nobody checks the host of a link they were told to expect.
 *
 * Allowed: a single leading "/" followed by a path. Everything else falls back.
 * The cases that matter, all of which a browser resolves off-site:
 *   "https://evil.example"  absolute
 *   "//evil.example"        protocol-relative, inherits the current scheme
 *   "/\evil.example"        backslash, which several parsers fold to "//"
 *   "/\/evil.example"       the same trick one character further in
 * Control characters are rejected too: a stripped newline or tab can turn a
 * rejected shape back into an accepted one after the browser normalises it.
 */
export function safeRedirect(candidate: unknown, fallback = "/"): string {
  if (typeof candidate !== "string") return fallback;

  const value = candidate.trim();
  if (value.length === 0 || value.length > MAX_LENGTH) return fallback;

  // A code-point scan rather than a regex, so the control characters being
  // rejected do not have to appear literally in this file.
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return fallback;
  }

  if (!value.startsWith("/")) return fallback;
  // Any backslash at all: there is no legitimate route here containing one, and
  // enumerating where it is harmful is a worse bet than refusing it outright.
  if (value.includes("\\")) return fallback;
  if (value.startsWith("//")) return fallback;

  return value;
}
