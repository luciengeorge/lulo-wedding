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
        # Well inside the band the fade weight is 1, so heights sit 0.04 above a step.
        for x in (-8.0, -3.0, 0.5, 6.0, 9.0):
            for y in (-0.5, 0.8, 2.0, 2.9):
                h = hm.height(x, y)
                if h <= 0.05:
                    continue
                remainder = (h - 0.04) / hm.TERRACE_STEP
                self.assertAlmostEqual(remainder, round(remainder), places=5, msg=f"{x},{y}")

    def test_no_quantisation_outside_the_band(self):
        h = hm.height(0.5, 5.5)
        remainder = (h - 0.04) / hm.TERRACE_STEP
        self.assertNotAlmostEqual(remainder, round(remainder), places=3)

    def test_village_knoll_rises_above_its_surroundings(self):
        vx, vy = hm.VILLAGE
        self.assertGreater(hm.height(vx, vy), hm.height(vx - 4.0, vy) + 0.3)

    def test_finite_everywhere(self):
        for i in range(0, 241, 8):
            for j in range(0, 161, 8):
                z = hm.height(-12 + i * 0.1, -8 + j * 0.1)
                self.assertTrue(math.isfinite(z))
                self.assertLess(z, 8.0)
                self.assertGreater(z, -1.0)


if __name__ == "__main__":
    unittest.main()
