/**
 * Draws the pictures the story turns into on its way through the weekend, and
 * writes them to public/art/story.
 *
 *   pnpm tsx tools/story-sketch/build.ts [name]
 *
 * Each is a still SVG in the hero's own pencil, written as geometry in a file
 * of its own here that exports its layers by default. The film reads them back
 * as pixels and lays its dots on them: src/components/wedding/story.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

import { type Layer, render } from "./kit.ts";

const OUT = new URL("../../public/art/story/", import.meta.url);

/** In the order the story shows them. A drawing's place here is also its seed, so adding one moves no other's lines. */
const NAMES = ["beirut", "jeita", "harissa", "byblos", "batroun", "vineyards", "cedars"];

mkdirSync(OUT, { recursive: true });
const only = process.argv[2];
for (const [i, name] of NAMES.entries()) {
  if (only && only !== name) continue;
  const source = new URL(`./${name}.ts`, import.meta.url);
  if (!existsSync(source)) continue;
  const { default: layers } = (await import(source.href)) as { default: Layer[] };
  const svg = render(layers, 101 + i * 37);
  writeFileSync(new URL(`${name}.svg`, OUT), svg);
  console.log(`${name}.svg: ${(svg.length / 1024).toFixed(0)} KB`);
}
