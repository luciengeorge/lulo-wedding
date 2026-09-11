import math
import unittest

from lib import frame
from lib import heightmap as hm


class HeightmapTest(unittest.TestCase):
    def test_table_constants(self):
        self.assertEqual((hm.TABLE_W, hm.TABLE_D), (24.0, 16.0))
        self.assertEqual(hm.EXAGGERATION, 3.0)

    def test_real_elevation_at_landmarks(self):
        self.assertLess(abs(hm.elevation_m(*frame.landmark_xy("ashrafieh")) - 107), 60)
        self.assertLess(abs(hm.elevation_m(*frame.landmark_xy("warde")) - 1931), 120)
        self.assertLess(abs(hm.elevation_m(*frame.landmark_xy("harissa")) - 587), 80)
        self.assertLess(hm.elevation_m(*frame.landmark_xy("jounieh")), 60)

    def test_sea_is_below_zero_and_falls_away(self):
        x, y = frame.landmark_xy("pigeon_rocks")
        self.assertFalse(hm.is_land(x - 0.6, y - 0.6))
        near = hm.height(x - 0.6, y - 0.6)
        far = hm.height(x - 0.6, y - 2.5) if y - 2.5 >= -8.0 else hm.height(-3.0, -7.9)
        self.assertLess(near, hm.SEA_LEVEL)
        self.assertLessEqual(far, near + 1e-6)

    def test_land_at_landmarks(self):
        for pid in ("ashrafieh", "jounieh", "harissa", "bikfaya", "faraya", "warde", "byblos"):
            self.assertTrue(hm.is_land(*frame.landmark_xy(pid)), pid)

    def test_sannine_is_the_highest_ground_and_exaggerated(self):
        sx, sy = frame.landmark_xy("sannine")
        peak = max(hm.height(sx + dx, sy + dy) for dx in (-0.3, 0, 0.3) for dy in (-0.3, 0, 0.3))
        self.assertGreater(peak, frame.metres_to_units(2200) * hm.EXAGGERATION)
        self.assertGreater(peak, hm.height(*frame.landmark_xy("ashrafieh")) + 2.5)

    def test_terraces_only_in_their_elevation_band(self):
        self.assertEqual(hm.terrace_weight(*frame.landmark_xy("warde")), 0.0)
        self.assertEqual(hm.terrace_weight(*frame.landmark_xy("jounieh")), 0.0)
        bx, by = frame.landmark_xy("bikfaya")
        band = max(hm.terrace_weight(bx + dx, by + dy) for dx in (-0.5, 0, 0.5) for dy in (-0.5, 0, 0.5))
        self.assertGreater(band, 0.3)

    def test_terrace_function_is_continuous_and_monotonic(self):
        previous = hm.terrace(0.0, 0.3)
        for i in range(1, 400):
            current = hm.terrace(i * 0.005, 0.3)
            self.assertGreaterEqual(current + 1e-9, previous)
            self.assertLess(current - previous, 0.05)
            previous = current

    def test_plateaus_are_level(self):
        for name, ((cx, cy), hw, hd) in hm.PLATEAUS.items():
            level = hm.height(cx, cy)
            for dx in (-hw, 0.0, hw):
                for dy in (-hd, 0.0, hd):
                    self.assertAlmostEqual(hm.height(cx + dx, cy + dy), level, places=6, msg=name)

    def test_finite_everywhere(self):
        for i in range(0, 241, 8):
            for j in range(0, 161, 8):
                z = hm.height(-12 + i * 0.1, -8 + j * 0.1)
                self.assertTrue(math.isfinite(z))
                self.assertLess(z, 4.5)
                self.assertGreater(z, -1.0)


if __name__ == "__main__":
    unittest.main()
