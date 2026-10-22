import { colorLegend, colorLegendItems } from "@tanstack/charts";

/**
 * Swatches under the plot, packed from the left and wrapping, so five series
 * fit two rows on a phone instead of a column of five.
 */
export function bottomLegend() {
  return colorLegend({
    placement: "bottom",
    items: colorLegendItems({
      justify: "start",
      gap: 14,
      rowGap: 6,
      indicator: { shape: "square", width: 10, height: 10, gap: 6 },
    }),
  });
}
