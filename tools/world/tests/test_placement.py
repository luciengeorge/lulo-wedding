import unittest

from lib import placement


class ScatterTest(unittest.TestCase):
    bounds = (-2.0, -2.0, 2.0, 2.0)

    def test_deterministic(self):
        a = placement.scatter(self.bounds, 0.5, lambda x, y: 1.0, seed=4)
        b = placement.scatter(self.bounds, 0.5, lambda x, y: 1.0, seed=4)
        self.assertEqual(a, b)

    def test_density_zero_gives_nothing(self):
        self.assertEqual(placement.scatter(self.bounds, 0.5, lambda x, y: 0.0, seed=1), [])

    def test_density_one_fills_the_grid(self):
        pts = placement.scatter(self.bounds, 0.5, lambda x, y: 1.0, seed=1)
        self.assertEqual(len(pts), 64)

    def test_points_stay_in_bounds_and_carry_scale_and_yaw(self):
        for x, y, scale, yaw in placement.scatter(self.bounds, 0.5, lambda x, y: 1.0, seed=2):
            self.assertTrue(-2.3 <= x <= 2.3 and -2.3 <= y <= 2.3)
            self.assertTrue(0.8 <= scale <= 1.2)
            self.assertTrue(0.0 <= yaw <= 6.3)

    def test_exclusion_discs_are_respected(self):
        pts = placement.scatter(self.bounds, 0.25, lambda x, y: 1.0, seed=3, exclude=[(0.0, 0.0, 1.0)])
        self.assertTrue(all(x * x + y * y >= 1.0 for x, y, _, _ in pts))
        self.assertGreater(len(pts), 100)


class AlongTest(unittest.TestCase):
    line = [(0.0, 0.0), (4.0, 0.0), (4.0, 3.0)]

    def test_resample_walks_the_polyline(self):
        pts = placement.resample(self.line, 1.0)
        self.assertEqual(pts[0], (0.0, 0.0))
        self.assertAlmostEqual(pts[-1][0], 4.0, places=5)
        self.assertEqual(len(pts), 8)

    def test_along_alternates_sides(self):
        pts = placement.along(self.line, 1.0, 0.3, seed=1)
        self.assertEqual(len(pts), 8)
        ys = [round(y, 3) for x, y, yaw in pts[:4]]
        self.assertEqual(sorted(set(ys)), [-0.3, 0.3])


if __name__ == "__main__":
    unittest.main()
