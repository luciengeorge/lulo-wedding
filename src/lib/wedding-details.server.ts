import type { Faq, TravelNote, WeddingEvent } from "@/lib/wedding-info";

/**
 * The details that can belong to one event, kept server-only.
 *
 * The pre-wedding and brunch are for some guests only, and anything in a client
 * module ships to every browser, invited or not. The home page's loader sends
 * each party only what `visibleTo` allows (see wedding-info.ts), so a detail
 * tagged `events: ["brunch"]` reaches brunch guests and nobody else.
 *
 * `null` means "not confirmed yet", as in wedding-info.ts.
 */
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

/** Shuttles are not here: each event carries its own, and Travel lists the ones a guest can see. */
export const TRAVEL_NOTES: readonly TravelNote[] = [
  { title: "Driving", text: "Valet parking at the venue." },
  { title: "Visas", text: "Guidance for guests travelling from abroad to come.", pending: true },
];

export const FAQS: readonly Faq[] = [
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
