const DRAWINGS = ["teleski", "chairlift", "party"] as const;

/**
 * Loaded as `#still`, a drawing holds still. The page has to ask: a browser
 * does not reliably pass its reduced motion setting on to an image. The query
 * string keeps the still copy apart from the moving one in the browser's cache,
 * where the two would otherwise be treated as one image.
 */
const STILL = "?still#still";

/**
 * Le Refuge in pencil, behind the hero: the teleski climbs from the bottom left
 * corner, the chairlift from the bottom right, and the wedding party dances at
 * the foot of the slope between them. Decoration only.
 *
 * The drawings are SVG files that animate themselves, written by
 * tools/venue-sketch. Each has a wide version, with the crest of the slope,
 * the dinner tables and the outer strings of lights, and a narrow one without.
 * `.lulo-scene` in styles.css sizes and places them.
 */
export function VenueSketch() {
  return (
    <div aria-hidden className="lulo-scene pointer-events-none absolute inset-0">
      {DRAWINGS.map((name) => (
        <picture key={name}>
          <source
            media="(prefers-reduced-motion: reduce) and (min-width: 1024px)"
            srcSet={`/art/venue/${name}.svg${STILL}`}
          />
          <source media="(prefers-reduced-motion: reduce)" srcSet={`/art/venue/${name}-narrow.svg${STILL}`} />
          <source media="(min-width: 1024px)" srcSet={`/art/venue/${name}.svg`} />
          <img src={`/art/venue/${name}-narrow.svg`} alt="" decoding="async" className={`lulo-scene-${name}`} />
        </picture>
      ))}
    </div>
  );
}
