# The World: an immersive guest site in three.js

Design spec, 2026-09-10. Replaces every guest-facing page (`/enter`, `/`, `/rsvp`,
`/rsvp/$token`) with one persistent 3D diorama. Admin, auth, emails and the Convex
backend are untouched.

## Decisions already taken

| Decision | Answer | Source |
|---|---|---|
| World model | Living diorama: a stylised miniature of the Lebanese coast and mountain, free orbit/pan/zoom | Lucien, 2026-09-10 |
| Camera | Free exploration, plus tap-to-fly and a plain-HTML legend so nobody has to hunt | Lucien, 2026-09-10 |
| Audio | None for now. Leave a seam, build nothing | Lucien, 2026-09-10 |
| Palette | Same tonal family as the card (`src/styles.css` `@theme` tokens) | Lucien, 2026-09-10 |
| Assets | Authored by Blender scripts in the repo. Blender 5.2.1 LTS is installed and runs headless with glTF export | verified 2026-09-10 |
| Delivery | New branch `immersive-world`. The world replaces the current pages outright. Reviewed on the Vercel preview URL on a phone before merge | Lucien, 2026-09-10 |
| Time | Not a constraint. The bar is "looks incredible" | Lucien, 2026-09-10 |
| Art direction gate | Cycles stills of the world are approved before any web code is written | this spec |

## Non-goals

- Photoreal rendering. Scripted Blender cannot hand-sculpt hero assets; the look is stylised on purpose.
- First-person walking. Orbit only.
- Sound.
- Touching `/admin`, `/login`, the auth flows, the emails, or any Convex function.
- Multi-language.
- Seating charts, registry contents, hotel data. Places for them exist in the world; content arrives later per `docs/awaiting.md`.

## The concept

A miniature Lebanon sits on the cream paper of the save-the-date card. Sea in the
foreground, a thin shore, terraced olive groves stepping up to a hill village, a
mountain ridge behind, cypress along the roads. The model turns freely under a
finger. Light drifts slowly from golden afternoon to dusk; as it dims, windows and
lanterns come on.

Colour discipline carries over from the card: `paper` is the ground everything sits
on, `bark` is stone and earth, `foliage` is the groves, `sea` is the water, `amber`
is the low sun and the lanterns, and `ink` red appears only as accents: the venue's
roof tiles, lanterns, flags on the post house, the hairlines of the HTML overlays.
Never a filled panel.

### The arrival

Before the password the guest sees the same world unpainted: a folded paper
maquette, all `paper` with soft ambient occlusion, the sea a flat sheet. The
password form floats over it as ordinary HTML. A correct password paints the world:
colour sweeps outward from the shore across the terraces and up the ridge, the sea
starts moving, the sky warms, the birds lift. The camera then rises to the
establishing view with the monogram and `17 · 07 · 27` over the sky. That view is the
save-the-date.

### Places

Content lives at places. A place is a named point in the world with a framed camera
shot and an HTML card.

| Place | Content | Status |
|---|---|---|
| Shore | Pre-wedding, Thursday 15 July | archetype now, venue name later |
| Hill | Wedding, Saturday 17 July | at Warde, the foot of the slopes; venue name later |
| Garden | Brunch, Sunday 18 July | archetype now, venue name later |
| Post house | RSVP form | built |
| Hotel | Where to stay | geometry only, unmarked until content |
| Harbour and road | Getting there, visas | geometry only, unmarked |
| Landmarks | Things to do | geometry only, unmarked |
| Chapel steps | Registry | geometry only, unmarked |
| Village square | Questions | geometry only, unmarked |

Tapping a place tweens the camera to its framed shot and slides its card in. A
legend in the corner lists every marked place as plain links. The legend is the
accessible and impatient path; the diorama is the delightful one. Both reach the same
cards.

## Routes

A new pathless layout owns the canvas so navigation never remounts the world.

| Route | World state | Overlay |
|---|---|---|
| `/enter` | `paper` | gate form (existing `enterGate` server fn) |
| `/` | `overview` after paint | monogram, date, legend |
| `/rsvp/$token` | `focused: post-house` | RSVP form (existing components and server fns) |
| `/rsvp` | `overview` | lost-link message (existing) |
| `/enter?redirect=…` | `paper` | gate, then camera flies to the target place |

Guards are unchanged: `requireGuestUnlocked`, `getAdminSession`, `FEATURES.rsvp`, the
`safeRedirect` handling, the remembered token. Only the presentation layer moves.

A direct RSVP link on a fresh device goes gate → paint → fly to the post house without
passing through the overview. A guest who wants only to reply is never made to
explore.

## Architecture

### Layout

```
src/
  routes/
    _world.tsx                 pathless layout: canvas island + overlay slot
    _world/
      enter.tsx                moved from routes/enter.tsx, form only
      index.tsx                moved from routes/index.tsx, overlay only
      rsvp.index.tsx           moved
      rsvp.$token.tsx          moved
  world/
    World.tsx                  client-only R3F canvas, mounts the scene
    scene/                     terrain, sea, sky, trees, buildings, particles
    materials/                 paint sweep, water, sky, lightmap blend
    camera/                    controls, limits, framing, tweens
    places.ts                  the place registry: id, position, shot, card
    state.ts                   pure state machine (route → world state)
    tier.ts                    GPU tiering decision (pure)
    fallback/                  stills-based fallback for reduced motion / no WebGL
  components/world/            HTML overlays: legend, place cards, HUD
tools/world/                   Blender scripts, bake, export, stills
public/world/                  committed glTF, KTX2, stills
```

`src/world/state.ts`, `places.ts`, `tier.ts` and the framing maths are pure modules
with no three.js imports, tested with Vitest like `src/lib/rsvp-rules.ts` is today.

### The state machine

```
loading  →  paper  →  painting  →  overview  ⇄  focused(place)
                                      ↓
                                   fallback (any state, on capability failure)
```

Inputs: route, gate unlocked, capability tier, reduced-motion preference, place
tapped, escape or "back to map". Output: camera target, overlay, material `paint`
value, light time. Route is the source of truth. The state machine derives from it;
it never pushes to it except through the router.

### Canvas island

React Three Fiber v9 line on React 19, loaded with `lazy` behind the router's
client-only boundary so SSR renders the HTML shell and the fallback still. Exact
package versions are pinned at implementation time from current docs, not memory.

Render loop is on demand: the scene renders only while the camera moves, a tween
runs, or the paint sweep plays. The day cycle advances the sun at a low cadence and
requests a frame. This is the single largest lever for phone heat and battery.

### Camera

`camera-controls` under R3F for smooth tweens with hard limits: minimum and maximum
distance, polar angle clamped so the guest never sees under the table, azimuth free,
pan clamped to the table bounds. Every place has an authored shot (position, target,
fov). Tween duration and easing are shared constants so the world feels like one
hand moved it.

### Materials and atmosphere

- **Lightmap blend.** Cycles bakes ambient occlusion and a soft sun into one atlas per
  material group. At runtime the atlas multiplies the albedo and a single real-time
  directional light adds the moving sun. No real-time shadows on the low tier, cheap
  PCF on the high tier.
- **Paint sweep.** One shared uniform `uPaint` from 0 to 1 and a world-space origin at
  the shore. Every world material lerps from the paper look (albedo replaced by
  `paper`, saturation 0, lightmap only) to full colour by distance from the origin,
  with a soft edge. Injected once via `onBeforeCompile` so new materials get it for
  free.
- **Sea.** Custom shader: two low-frequency wave layers displacing normals, a Fresnel
  tint from `sea` to the sky colour, and a foam line where depth to the terrain is
  shallow. Still and flat in the paper state.
- **Sky.** Gradient dome driven by `uTime`: warm afternoon to amber dusk to deep blue,
  sun disc following the directional light, stars fading in past dusk.
- **Lanterns and windows.** Emissive channel scaled by the time of day. Bloom on the
  high tier only, low threshold, small radius.
- **Particles.** A flock of swifts as a small instanced boid, dust motes in the sun,
  nothing that costs more than a few draw calls.

### Places and overlays

`places.ts` is the registry: id, world position, shot, marker visibility, card
component. Markers are `drei/Html` anchored to positions so they are real DOM
buttons that scale and occlude correctly. The legend maps the same registry to a
`<nav>` list. Cards are existing wedding-styled DOM components, positioned at the
screen edge on desktop and as a bottom sheet on a phone.

## Asset pipeline

All authored in `tools/world/` as Python for Blender's bundled interpreter.

1. `build_world.py` constructs the scene: terrain from a scripted heightmap with
   stepped terraces, sea plane, roads and walls as curves, four tree archetypes
   (olive, cypress, pine, palm) placed as instances by density maps, a vocabulary of
   stone houses, arches, a bell tower, a pergola, the post house, the hotel. Every
   number is a named constant at the top of the file.
2. `bake.py` unwraps to lightmap UVs, bakes AO and sun with Cycles on the M4 Metal
   backend, packs atlases.
3. `export.py` writes glTF with Draco. `gltf-transform` (installed as a dev
   dependency) then dedupes, prunes, resizes and converts textures to KTX2.
4. `stills.py` renders the approval stills and the fallback images at full Cycles
   quality: overview afternoon, overview dusk, each place, and the link preview.

Outputs are committed to `public/world/`. Regeneration is `pnpm world:build`. The
Blender scripts are the source of truth; nothing in `public/world/` is hand-edited,
the same rule as `tools/monogram/`.

## Performance

| Budget | Target |
|---|---|
| Initial download before the paper world appears | under 3 MB |
| Painted world after password on 4G | under 2 s |
| Steady frame rate, mid-range Android, high tier | 60 |
| Steady frame rate, low tier | 30 or better |
| Draw calls, overview | under 150 |
| Device pixel ratio | clamped to 1.5 high, 1 low |

Tiering uses `detect-gpu` plus a WebGL2 and memory check. Low tier: no
postprocessing, half instance density, no real-time shadows, smaller KTX2 mips. The
decision is a pure function, unit tested, and overridable by a query parameter for
review.

The primary review device is a mid-range Android on the Vercel preview URL, not a
laptop. Headless screenshots prove the scene renders, not that it looks right or runs
cool.

## Fallback

`prefers-reduced-motion`, no WebGL2, a lost context, or a tier below "low" renders
the Cycles stills of the same world with the same overlays. The paper-to-colour moment
becomes a crossfade between the paper still and the painted still. Every place is
reachable through the legend. Content parity is total; only motion is missing.

## Accessibility

- All text and forms are DOM. The canvas is `aria-hidden`.
- The legend is a `<nav>`; markers are buttons with the place name.
- Focus moves into a card when it opens and returns to its marker when it closes.
- Escape closes a card and returns to the overview.
- Colour contrast of overlays is checked against the painted stills, not the paper.

## Analytics and privacy

Place opens are captured as events. Path masking in `src/lib/analytics-path.ts` is
unchanged, so the RSVP token never reaches analytics. No new third-party origins; the
CSP in `nitro.config.ts` needs no change unless a font or CDN is added, and none is
planned.

## Testing

- Vitest: state machine transitions, place registry integrity (every place has a shot
  and a card, every card a place), tier decision table, camera limit clamping,
  framing maths.
- Playwright: the existing `gate.spec.ts`, `rsvp.spec.ts` and `admin-auth.spec.ts`
  keep passing unchanged, since the forms are the same DOM. New spec: with WebGL
  disabled the fallback renders and a party can still reply end to end. New spec: a
  direct RSVP link on a fresh device lands on the post house card.
- Visual review: Cycles stills at each phase gate, then the preview URL on a phone.
  No visual claim is made from a headless capture.

## Phases

1. **Look.** Blender world, Cycles stills. Lucien approves the art direction. No web
   code before this.
2. **Pipeline and orbit.** Export, `gltf-transform`, canvas island under `_world`,
   camera controls with limits, demand rendering, tiering, fallback stills path.
3. **Atmosphere.** Lightmap blend, sky, sea, day cycle, paint sweep, bloom on high tier.
4. **Places.** Registry, markers, legend, cards, framing tweens, deep links.
5. **Integration.** Gate on the paper state, save-the-date overview, event cards,
   RSVP at the post house, route moves, all existing specs green.
6. **Polish.** Swifts, motes, lanterns, loading choreography with the monogram draw,
   performance passes on real phones, preview review, merge.

Each phase ends with a review on the preview URL.

## Risks

- **Art direction misses.** Mitigated by phase one: stills before code, and the
  explicit reference to how the last spike failed by starting from the layout.
- **Phone performance.** Mitigated by demand rendering, tiering, instancing, baked
  light, and reviewing on a real Android from phase two onward.
- **Scripted assets look procedural.** Mitigated by a small hand-tuned vocabulary
  with variation, baked light, and a stylised look that reads as intent.
- **Ecosystem drift.** R3F, drei, camera-controls and gltf-transform versions are
  read from current docs at implementation, never from memory.
- **Content gaps.** Venues, times, hotels and the rest are still open in
  `docs/awaiting.md`. Places are archetypes with copy that says so, never invented
  detail that looks real.

## Resolved on 2026-09-11

| Question | Answer |
|---|---|
| Mountain silhouette and coast | Not required to be exact, but as close to reality as possible: terrain from real elevation data, real coastline, real town positions, at a souvenir-model scale where buildings stay legible |
| Geography in the overview | Literal: the guest should recognise the coast |
| Sea in the paper state | Visible: the sea reads as water even unpainted, by finish rather than colour |
| Legend | Behind a single button, not always visible |
| Frame | Ashrafieh in Beirut at the south-west to the foot of the Warde ski slopes above Faraya at the north-east, from real elevation |
| Wedding venue location | Warde, the foot of the slopes. The hill place is the venue |
