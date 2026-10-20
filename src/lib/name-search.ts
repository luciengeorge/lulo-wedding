/**
 * Finding a party by a guest typing their own name.
 *
 * Free of Convex imports, the same way src/lib/rsvp-rules.ts is, so the matching
 * can be tested without a deployment. `convex/rsvp.ts` runs it over the whole
 * guest list inside `lookupByName`.
 *
 * Strict on purpose. A match hands over the party's link, which is the only
 * credential an invitation has, so one common word must never be enough.
 */

export type NameKeys = {
  /** Every word that names someone in the party. */
  words: ReadonlySet<string>;
  /** The whole display name, for a party known by one word ("Lucy"). */
  whole: string;
};

/** "&", "+", "et" and "and" join people in a display name; they name nobody. */
const CONNECTORS = new Set(["et", "and"]);

/** NFD, accents dropped, lowercased, punctuation turned into spaces, whitespace collapsed. */
export function normaliseName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The words in a name, connectors removed. A hyphenated or apostrophised word
 * yields its parts and the parts run together, so "Abou-Jaoudé" is found by
 * "abou jaoude" and by "aboujaoude" alike.
 */
function nameWords(value: string): string[] {
  const words: string[] = [];
  for (const raw of value.split(/\s+/)) {
    const parts = normaliseName(raw).split(" ").filter(Boolean);
    words.push(...parts);
    if (parts.length > 1) words.push(parts.join(""));
  }
  return words.filter((word) => !CONNECTORS.has(word));
}

export function nameKeys(
  party: { displayName: string; surname: string },
  guests: readonly { firstName: string; lastName: string }[],
): NameKeys {
  const words = new Set([...nameWords(party.displayName), ...nameWords(party.surname)]);
  for (const guest of guests) {
    for (const word of nameWords(`${guest.firstName} ${guest.lastName}`)) words.add(word);
  }
  return { words, whole: normaliseName(party.displayName) };
}

/**
 * True when every word typed names someone in the party.
 *
 * Two words at least, so a first name alone, or a surname shared by half the
 * guest list, finds nothing. The one exception is a party with no surname, which
 * can only be found by its whole name. The last word may be a prefix of three
 * letters or more, for someone who stops typing early; the others must be whole.
 */
export function matches(query: string, keys: NameKeys): boolean {
  const normalised = normaliseName(query);
  if (normalised === "") return false;
  if (normalised === keys.whole) return true;

  const words = normalised.split(" ").filter((word) => !CONNECTORS.has(word));
  if (words.length < 2) return false;

  return words.every((word, index) => {
    if (keys.words.has(word)) return true;
    if (index !== words.length - 1 || word.length < 3) return false;
    for (const key of keys.words) if (key.startsWith(word)) return true;
    return false;
  });
}
