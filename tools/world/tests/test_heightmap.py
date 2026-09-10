import math
import unittest

from lib import heightmap as hm


class HeightmapTest(unittest.TestCase):
    def test_table_constants(self):
        self.assertEqual((hm.TABLE_W, hm.TABLE_D), (24.0, 16.0))
        self.assertEqual(hm.TERRACE_BAND, (-1.0, 4.0))

    def test_coastline_stays_near_shore_line(self):
        for x in range(-12, 13):
            self.assertLess(abs(hm.coastline(x) - hm.SHORE_Y), 1.0)

    def test_sea_is_below_sea_level_and_land_above(self):
        for x in (-10, -4, 0, 4, 10):
            self.assertLess(hm.height(x, -7.0), hm.SEA_LEVEL)
            self.assertGreater(hm.height(x, 2.0), hm.SEA_LEVEL + 0.2)
        self.assertFalse(hm.is_land(0, -6))
        self.assertTrue(hm.is_land(0, 5))

    def test_ridge_is_the_highest_ground(self):
        ridge = max(hm.height(x, 6.5) for x in range(-11, 12))
        foothills = max(hm.height(x, 1.0) for x in range(-11, 12))
        self.assertGreater(ridge, 4.0)
        self.assertGreater(ridge, foothills + 1.5)

    def test_terraces_quantise_inside_the_band(self):
        # Well inside the band the fade weight is 1. On a flat top the height sits
        # 0.04 above a step; on a riser it lies between that step and the next.
        for x in (-8.0, -3.0, 0.5, 6.0, 9.0):
            for y in (-0.5, 0.8, 2.0, 2.9):
                s = hm.smooth_height(x, y)
                if s <= 0.05 or hm.terrace_weight(x, y) < 0.999 or hm.plateau_mask(x, y) > 0.0:
                    continue
                h = hm.height(x, y)
                n = math.floor(s / hm.TERRACE_STEP)
                frac = s / hm.TERRACE_STEP - n
                low, high = n * hm.TERRACE_STEP + 0.04, (n + 1) * hm.TERRACE_STEP + 0.04
                if frac < 0.4:
                    self.assertAlmostEqual(h, low, places=5, msg=f"{x},{y}")
                else:
                    self.assertTrue(low - 1e-6 <= h <= high + 1e-6, f"{x},{y}: {h} not in [{low}, {high}]")

    def test_terrace_function_is_continuous_and_monotonic(self):
        previous = hm.terrace(0.0, 0.3)
        for i in range(1, 400):
            s = i * 0.005
            current = hm.terrace(s, 0.3)
            self.assertGreaterEqual(current + 1e-9, previous)
            self.assertLess(current - previous, 0.05)
            previous = current

    def test_riser_fraction_follows_the_gradient(self):
        points = [(x, y) for x in (-6.0, 0.0, 4.0) for y in (-0.5, 1.0, 2.5)]
        for a in points:
            for b in points:
                if hm.gradient(*a) > hm.gradient(*b) + 1e-6:
                    self.assertGreaterEqual(hm.riser_fraction(*a), hm.riser_fraction(*b))

    def test_terracing_fades_out_on_steep_ground(self):
        self.assertEqual(hm.terrace_weight(0.0, 5.5), 0.0)
        gentle = hm.terrace_weight(-8.0, 1.5)
        self.assertGreater(gentle, 0.5)
        steep_flank = min(hm.terrace_weight(hm.VILLAGE[0] + dx, hm.VILLAGE[1] + dy) for dx, dy in ((-1.6, 0), (1.6, 0), (0, -1.2), (0, 1.2)))
        self.assertLess(steep_flank, gentle)

    def test_no_quantisation_outside_the_band(self):
        h = hm.height(0.5, 5.5)
        remainder = (h - 0.04) / hm.TERRACE_STEP
        self.assertNotAlmostEqual(remainder, round(remainder), places=3)

    def test_village_knoll_rises_above_its_surroundings(self):
        vx, vy = hm.VILLAGE
        self.assertGreater(hm.height(vx, vy), hm.height(vx - 4.0, vy) + 0.3)

    def test_garden_plateau_is_level(self):
        (cx, cy), hw, hd = hm.PLATEAUS["garden"]
        level = hm.height(cx, cy)
        for dx in (-hw, 0.0, hw):
            for dy in (-hd, 0.0, hd):
                self.assertAlmostEqual(hm.height(cx + dx, cy + dy), level, places=6)
        self.assertNotAlmostEqual(hm.height(cx, cy + hd + hm.PLATEAU_APRON + 0.5), level, places=1)

    def test_finite_everywhere(self):
        for i in range(0, 241, 8):
            for j in range(0, 161, 8):
                z = hm.height(-12 + i * 0.1, -8 + j * 0.1)
                self.assertTrue(math.isfinite(z))
                self.assertLess(z, 8.0)
                self.assertGreater(z, -1.0)


if __name__ == "__main__":
    unittest.main()
