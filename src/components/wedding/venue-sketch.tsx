const DRAWINGS = ["teleski", "chairlift", "party"] as const;

/**
 * Loaded as `#still`, a drawing holds still. The page has to ask: a browser
 * does not reliably pass its reduced motion setting on to an image. The query
 * string keeps the still copy apart from the moving one in the browser's cache,
 * where the two would otherwise be treated as one image.
 */
const STILL = "?still#still";

/** A blank pixel for screens under 640px tall, where the scene is hidden, so the drawings are not downloaded. */
const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

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
          <source media="(max-height: 639px)" srcSet={BLANK} />
          <source
            media="(prefers-reduced-motion: reduce) and (min-width: 64rem)"
            srcSet={`/art/venue/${name}.svg${STILL}`}
          />
          <source media="(prefers-reduced-motion: reduce)" srcSet={`/art/venue/${name}-narrow.svg${STILL}`} />
          <source media="(min-width: 64rem)" srcSet={`/art/venue/${name}.svg`} />
          {/* Low priority: on a slow connection the names and fonts come first; the
              scene only fades in at 1.7s anyway. */}
          <img
            src={`/art/venue/${name}-narrow.svg`}
            alt=""
            fetchPriority="low"
            decoding="async"
            className={`lulo-scene-${name}`}
          />
        </picture>
      ))}
    </div>
  );
}
