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
    goodToKnow: null,
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
    dress: "Formal attire. Comfortable shoes and a jacket or shawl for the mountain evening.",
    shuttle: { from: "the InterContinental Mzaar Hotel", time: null },
    goodToKnow: null,
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
    goodToKnow: null,
    calendar: false,
  },
];

/** Shuttles are not here: each event carries its own, and Travel lists the ones a guest can see. */
export const TRAVEL_NOTES: readonly TravelNote[] = [
  { title: "Driving", text: "For guests driving to the venue, valet parking will be available on-site." },
  { title: "Visas", text: "Guidance for guests travelling from abroad to come.", pending: true },
];

export const FAQS: readonly Faq[] = [
  {
    question: "What's the weather like in July?",
    answer: [
      {
        type: "paragraph",
        text: "July is a beautiful time to be in Faraya. Expect warm, sunny days and cooler mountain evenings. Temperatures can drop after sunset, so we recommend bringing a jacket or shawl to stay comfortable throughout the night.",
      },
    ],
  },
  {
    question: "How far is Faraya from Beirut?",
    answer: [
      {
        type: "paragraph",
        text: "Faraya is approximately a 1 to 1.5-hour drive from Beirut, depending on traffic. During summer weekends, the roads can get busy, so we recommend allowing a little extra travel time, especially on the wedding day.",
      },
    ],
  },
  {
    question: "How do I get around?",
    answer: [
      {
        type: "paragraph",
        text: "For your convenience, we have arranged shuttle services between the InterContinental Mzaar Hotel and the wedding venue.",
      },
      {
        type: "paragraph",
        text: "Alternatively, if you prefer to book a taxi, you can contact Snow Taxi at +961 3 583 068 / +961 3 065 131 / +961 76 583 068 and for guests driving to the venue, valet parking will be available on-site.",
      },
    ],
  },
  {
    question: "What should I wear?",
    answer: [
      {
        type: "paragraph",
        text: "The dress code is formal attire, but comfort is key. We recommend wearing comfortable shoes and bringing a jacket or shawl, as mountain evenings can get a little chilly.",
      },
      {
        type: "paragraph",
        text: "And don't forget your dancing shoes, we expect you on the dance floor all night long!",
      },
    ],
  },
  {
    question: "Where can I get my hair and makeup done?",
    answer: [
      {
        type: "paragraph",
        text: "For those staying in the Faqra/Faraya area, here are a couple of options to get wedding-ready:",
      },
      {
        type: "list",
        items: ["InterContinental Mzaar Hotel", "Dany Attieh, Faqra"],
      },
      {
        type: "paragraph",
        text: "We recommend booking your appointments in advance to secure your preferred time.",
      },
    ],
  },
];
