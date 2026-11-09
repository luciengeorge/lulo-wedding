import type { RsvpEventKey } from "@/lib/rsvp-rules";

/**
 * Everything the home page tells guests, in one place.
 *
 * Most of it comes from the planner's brief. `null` means "not confirmed yet":
 * the page draws an honest placeholder for it, never an invented value, so
 * filling a detail in later is a one-line change here and nothing else.
 */

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
  /** Offer an add-to-calendar link. */
  calendar: boolean;
};

export const WEDDING_EVENTS: readonly WeddingEvent[] = [
  {
    key: "preWedding",
    name: "Pre-wedding",
    day: 15,
    weekday: "Thursday",
    area: null,
    venue: null,
    time: null,
    dress: null,
    shuttle: null,
    calendar: false,
  },
  {
    key: "wedding",
    name: "The wedding",
    day: 17,
    weekday: "Saturday",
    area: "Faraya",
    venue: null,
    time: null,
    dress: "Formal. Comfortable shoes and a light layer for the mountain evening.",
    shuttle: { from: "the InterContinental Mzaar", time: null },
    calendar: true,
  },
  {
    key: "brunch",
    name: "Brunch",
    day: 18,
    weekday: "Sunday",
    area: null,
    venue: null,
    time: null,
    dress: null,
    shuttle: null,
    calendar: false,
  },
];

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

export const FAQS: readonly { question: string; answer: string }[] = [
  {
    question: "What is the weather like in July?",
    answer:
      "Warm and sunny by day, cooler in the mountain evenings. Temperatures drop after sunset, so bring a jacket or shawl.",
  },
  {
    question: "What should I wear?",
    answer:
      "Formal attire, but comfort is key. Wear shoes you can stand and dance in, and bring a layer for the evening. We expect you on the dance floor all night.",
  },
  {
    question: "Where can I get my hair and make-up done?",
    answer:
      "Near Faqra and Faraya: the InterContinental Mzaar, or Dany Attieh in Faqra. Book ahead to get the time you want.",
  },
];

export const PLACES: readonly { name: string; kind: string; text: string }[] = [
  {
    name: "Beirut",
    kind: "The city",
    text: "Walk the churches and mosques of downtown, from Saint George and its ruins to the Mohammad Al-Amin Mosque. Wander Gemmayzeh and Mar Mikhael, and leave time for the National Museum, the Sursock Museum and the MIM.",
  },
  {
    name: "Batroun",
    kind: "The coast",
    text: "A coastal town in the north and one of the oldest continuously inhabited places in the world. Bolero, Almaza Bay, Butler's Beach Club and the Phoenician Wall are all worth a visit.",
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

/** What the registry section says once there is something to say. */
export const REGISTRY: { text: string; href?: string } | null = null;

/** `tel:` wants no spaces. */
export function telHref(number: string) {
  return `tel:${number.replace(/\s+/g, "")}`;
}
