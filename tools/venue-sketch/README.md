# Venue sketch

The pencil drawing behind the home page hero: Le Refuge in Faraya, with the
teleski up the left of the slope, the chairlift up the right, and the wedding
party dancing at the foot of it.

Run from the repo root:

    pnpm tsx tools/venue-sketch/build.ts

It writes six SVG files to `public/art/venue`: the teleski, the chairlift and
the party, each in a wide and a narrow version. Edit the geometry here and
regenerate; never edit the SVG files directly.

- `hand.ts` is the pencil. Shapes are written as plain geometry and redrawn
  with a seeded wobble, so the same input always gives the same lines.
- `slope.ts` holds the two lifts and the slope. Each lift has a vanishing
  point; chairs and tows ride by being scaled about it.
- `party.ts` holds the dance floor, DJ, tables, fairy lights and guests. People
  are built from a skeleton, so a pose is a few angles, or a point for a hand
  to reach.
- `build.ts` turns all of that into SVG, with the CSS animation inside each
  file.

The files animate themselves and stop under `prefers-reduced-motion`. The page
only sizes and places them: see `.lulo-scene` in `src/styles.css` and
`src/components/wedding/venue-sketch.tsx`. Strokes and layers marked `wide`
appear only in the wide version (shown from 1024px up), those marked `narrow`
only in the narrow one.
