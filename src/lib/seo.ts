/**
 * Per-page metadata.
 *
 * The whole site is `noindex, nofollow` — it is a private event, not something
 * to be found. These tags exist for the link previews guests actually see:
 * every guest arrives by a link pasted into WhatsApp, so the unfurl IS the
 * first impression, and it has to carry a real image and the couple's names
 * rather than a framework placeholder.
 */

export const SITE_NAME = "Laura & Lucien";
export const SITE_URL = import.meta.env.VITE_SITE_URL ?? "http://localhost:3000";

/** Absolute, because Open Graph consumers do not resolve relative URLs. */
export const OG_IMAGE = `${SITE_URL}/og-cover.jpg`;
export const OG_IMAGE_WIDTH = "1200";
export const OG_IMAGE_HEIGHT = "630";
const OG_IMAGE_ALT = "Save the date — Laura and Lucien, 17 July 2027, Lebanon";

interface SeoInput {
  /** Page title. Omit on the home page to use the bare site name. */
  title?: string;
  description: string;
  /** Path only, e.g. "/enter". Combined with SITE_URL for canonical and og:url. */
  path?: string;
  /** Admin pages get no preview image and should never be previewed at all. */
  noPreview?: boolean;
}

type MetaTag = { title: string } | { name: string; content: string } | { property: string; content: string };

/**
 * Returns the `meta` array for a route's `head()`. TanStack Start merges these
 * over the root's, so a page only declares what differs.
 */
export function seo({ title, description, path = "/", noPreview = false }: SeoInput): MetaTag[] {
  const fullTitle = title ? `${title} · ${SITE_NAME}` : SITE_NAME;
  const url = `${SITE_URL}${path}`;

  const tags: MetaTag[] = [
    { title: fullTitle },
    { name: "description", content: description },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: url },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: "en_GB" },
  ];

  if (noPreview) {
    // No image, and a plain summary card: nothing about the admin tool should
    // render invitingly if a link to it is ever pasted somewhere.
    tags.push({ name: "twitter:card", content: "summary" });
    return tags;
  }

  tags.push(
    { property: "og:image", content: OG_IMAGE },
    { property: "og:image:width", content: OG_IMAGE_WIDTH },
    { property: "og:image:height", content: OG_IMAGE_HEIGHT },
    { property: "og:image:alt", content: OG_IMAGE_ALT },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: OG_IMAGE },
    { name: "twitter:image:alt", content: OG_IMAGE_ALT },
  );

  return tags;
}

/** Canonical link for a page. Kept separate because `head()` splits meta and links. */
export function canonical(path = "/") {
  return { rel: "canonical", href: `${SITE_URL}${path}` };
}
