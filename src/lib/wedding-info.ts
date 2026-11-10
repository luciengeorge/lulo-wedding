import { RSVP_EVENTS, type RsvpEventKey } from "@/lib/rsvp-rules";

/**
 * Everything the home page tells guests, in one place.
 *
 * Most of it comes from the planner's brief. `null` means "not confirmed yet":
 * the page draws an honest placeholder for it, never an invented value, so
 * filling a detail in later is a one-line change here and nothing else.
 *
 * Anything that belongs to one event (its venue, a shuttle, an FAQ answer only
 * brunch guests need) goes in wedding-details.server.ts instead, tagged.
 */

/**
 * Which events a detail belongs to. Untagged, or tagged with the wedding, means
 * every guest past the password sees it. Tagged only with the pre-wedding or the
 * brunch, it is for parties invited to one of those, and lives in
 * wedding-details.server.ts so it is never sent to anyone else.
 */
export type Tagged = { events?: readonly RsvpEventKey[] };

export function isPublic(item: Tagged): boolean {
  return !item.events?.length || item.events.includes("wedding");
}

export function visibleTo(item: Tagged, invited: readonly RsvpEventKey[]): boolean {
  return isPublic(item) || (item.events ?? []).some((event) => invited.includes(event));
}

/**
 * A tagged detail as the page gets it: the tag swapped for a label such as
 * "Brunch", or null when it is for everyone. The page never needs the rule.
 */
export type Shown<T extends Tagged> = Omit<T, "events"> & { onlyFor: string | null };

const LABEL = Object.fromEntries(RSVP_EVENTS.map((event) => [event.key, event.label])) as Record<RsvpEventKey, string>;
const and = new Intl.ListFormat("en-GB", { type: "conjunction" });

/** The items a party invited to `invited` may see, labelled. */
export function showTo<T extends Tagged>(items: readonly T[], invited: readonly RsvpEventKey[]): Shown<T>[] {
  return items
    .filter((item) => visibleTo(item, invited))
    .map(({ events, ...rest }) => ({
      ...rest,
      onlyFor: isPublic({ events }) ? null : and.format((events ?? []).map((event) => LABEL[event])),
    }));
}

export type Faq = Tagged & { question: string; answer: string };

/** A block in the Travel section. `pending` draws the text as not confirmed yet. */
export type TravelNote = Tagged & { title: string; text: string; pending?: boolean };

/** One event on the schedule. The events themselves are in wedding-details.server.ts, kept off the client. */
export type WeddingEvent = {
  key: RsvpEventKey;
  name: string;
  /** Day of the month, July 2027. */
  day: number;
  weekday: string;
  /** The town, when known before the venue is. */
  area: string | null;
  venue: string | null;
  time: string | null;
  dress: string | null;
  shuttle: { from: string; time: string | null } | null;
  /** What only this day's guests need: grass underfoot, the swim, the late finish. */
  goodToKnow: string | null;
  /** Offer an add-to-calendar link. */
  calendar: boolean;
};

export const TAXI = {
  name: "Snow Taxi",
  numbers: ["+961 3 583 068", "+961 3 065 131", "+961 76 583 068"],
} as const;

export const ROOM_BLOCK = {
  hotel: "InterContinental Mzaar",
  rooms: [
    { name: "Standard room", rate: null },
    { name: "Deluxe room", rate: null },
    { name: "Junior suite", rate: null },
  ] as { name: string; rate: string | null }[],
  /** How guests book the rate: a link, a code, or who to email. */
  booking: null as { label: string; href: string } | null,
};

export const NEARBY_HOTELS = [
  "Eleven Hotel",
  "Le Montagnou",
  "Urban Hotel",
  "Oakridge Hotel",
  "Terrebrune Hotel",
  "L'Auberge de Faqra",
] as const;

export const PLACES: readonly { name: string; kind: string; text: string }[] = [
  {
    name: "Beirut",
    kind: "The city",
    text: "Walk the churches and mosques of downtown, from Saint George and its ruins to the Mohammad Al-Amin Mosque. Wander Gemmayzeh and Mar Mikhael, and leave time for the National Museum, the Sursock Museum and the MIM.",
  },
  {
    name: "Batroun",
    kind: "The coast",
    text: "A coastal town in the north and one of the oldest continuously inhabited places in the world. Bolero, Almaza Bay, Lumi Beach House and the Phoenician Wall are all worth a visit.",
  },
  {
    name: "Cedars of God",
    kind: "The mountain",
    text: "In the Kadisha Valley above Bsharre, one of the last remnants of the cedar forests that once covered Mount Lebanon.",
  },
];

export const WINERIES: readonly { name: string; town: string }[] = [
  { name: "Château Ksara", town: "Ksara" },
  { name: "Ixsir", town: "Batroun" },
  { name: "Sept", town: "Nahleh" },
  { name: "Atibaia", town: "Smar Jbeil" },
];

/**
 * Two ways to give, because not everyone can send money abroad. `detail` is the
 * account or the shop, null until the couple have it.
 */
export const REGISTRY: readonly { title: string; text: string; detail: string | null }[] = [
  { title: "From abroad", text: "A bank transfer.", detail: null },
  { title: "In Lebanon", text: "A gift list at a local shop.", detail: null },
];

/** The planner's advice for guests landing in Beirut: one safe app, with a code for the wedding. */
export const AIRPORT_TAXI = { name: "Allo Taxi", code: null as string | null };

/** Day tours, for guests making a trip of it. `contact` is null until the planner sends it. */
export const TOURS = { contact: null as string | null };

/** `tel:` wants no spaces. */
export function telHref(number: string) {
  return `tel:${number.replace(/\s+/g, "")}`;
}
