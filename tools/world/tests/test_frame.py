import unittest

from lib import frame


class FrameTest(unittest.TestCase):
    def test_constants(self):
        self.assertEqual(frame.CENTRE, (33.9362, 35.6797))
        self.assertEqual(frame.BEARING, 20.0)
        self.assertEqual(frame.KM_PER_UNIT, 2.2)

    def test_round_trip(self):
        for lat, lon in ((33.887, 35.517), (34.005, 35.86), (33.821, 35.488)):
            x, y = frame.to_table(lat, lon)
            back = frame.to_latlon(x, y)
            self.assertAlmostEqual(back[0], lat, places=6)
            self.assertAlmostEqual(back[1], lon, places=6)

    def test_centre_is_origin(self):
        self.assertAlmostEqual(frame.to_table(*frame.CENTRE)[0], 0.0, places=9)
        self.assertAlmostEqual(frame.to_table(*frame.CENTRE)[1], 0.0, places=9)

    def test_sea_is_toward_negative_y(self):
        ax, ay = frame.landmark_xy("ashrafieh")
        px, py = frame.landmark_xy("pigeon_rocks")
        wx, wy = frame.landmark_xy("warde")
        self.assertLess(py, ay)
        self.assertGreater(wy, ay + 8.0)

    def test_every_landmark_is_on_the_table(self):
        for pid in frame.LANDMARKS:
            x, y = frame.landmark_xy(pid)
            self.assertTrue(-12.0 <= x <= 12.0 and -8.0 <= y <= 8.0, pid)

    def test_known_positions(self):
        x, y = frame.landmark_xy("ashrafieh")
        self.assertAlmostEqual(x, -4.68, places=1)
        self.assertAlmostEqual(y, -5.57, places=1)
        x, y = frame.landmark_xy("byblos")
        self.assertAlmostEqual(x, 8.33, places=1)

    def test_metres_to_units(self):
        self.assertAlmostEqual(frame.metres_to_units(2200.0), 1.0)


if __name__ == "__main__":
    unittest.main()
