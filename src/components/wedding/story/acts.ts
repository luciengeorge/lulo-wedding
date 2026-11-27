/**
 * What a story is made of, and how long each part runs. Small and on its own,
 * so that the page can know how long a guest's story is, and which lines of
 * text it has, without loading what draws it.
 *
 * Not every guest gets every act: the page's loader decides
 * (src/lib/functions/home-content.ts). The mountain is the one every story
 * ends on.
 */
export type Act = "friday" | "mountain";

/** The mountain's running time, the hero's own moment at its start included. */
export const MOUNTAIN_SECONDS = 40;
/** How many lines of text the mountain has. Their timing is CAPTIONS in timeline.ts. */
export const MOUNTAIN_LINES = 4;
/** In Friday, a picture takes this long to turn into the next, and then holds this long. */
export const TURN = 0.9;
export const HOLD = 1;

/** The places Friday shows, south to north and then up the mountain. Each is a drawing in public/art/story. */
export const FRIDAY = ["beirut", "jeita", "harissa", "byblos", "batroun", "vineyards", "cedars"] as const;

export const fridaySeconds = (acts: readonly Act[]) => (acts.includes("friday") ? FRIDAY.length * (TURN + HOLD) : 0);

/** How long the story runs when it plays itself. */
export const filmSeconds = (acts: readonly Act[]) => MOUNTAIN_SECONDS + fridaySeconds(acts);

/** The story's lines of text in order, each by its act and its place among that act's own. */
export function captionsOf(acts: readonly Act[]): { act: Act; line: number }[] {
  return [
    ...(acts.includes("friday") ? [{ act: "friday" as const, line: 0 }] : []),
    ...Array.from({ length: MOUNTAIN_LINES }, (_, line) => ({ act: "mountain" as const, line })),
  ];
}
