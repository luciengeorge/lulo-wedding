# Monogram handwriting guides

The LL monogram draws itself by masking the potrace outline with a thick stroke
animated along centrelines, in the order a hand would write the mark.

Two scripts, run from the repo root:

    python3 tools/monogram/snap_guides.py          # geometry + stroke widths
    python3 tools/monogram/gen_monogram_component.py

`snap_guides.py` holds the hand-authored stroke **order and direction** — that is
the part no tracing algorithm can infer, and the part worth editing. It then
snaps the geometry onto the skeleton of `public/art/monogram.svg` and measures
the half-width of ink around each stroke, writing `guides.json`.

Why snapping matters: the first version was eyeballed, and the script L's guide
measured a **median half-width of 0** — it sat off its own stroke for half its
length. The reveal left most of the mark uncovered, and the fade that filled it
in read as the whole logo ghosting into view.

Stroke width comes from the measured p90, not the max. The max occurs where
strokes cross and the mark is fattest; sizing for that bleeds into neighbouring
letterforms. The leftover is handled by a short fade in the component.

`gen_monogram_component.py` writes `src/components/wedding/monogram.tsx`. Edit
the guides here and regenerate — never edit the component directly.
