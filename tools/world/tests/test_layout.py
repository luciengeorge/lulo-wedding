import math
import unittest

from lib import heightmap as hm
from lib import layout


class LayoutTest(unittest.TestCase):
    def test_nine_places_with_the_spec_ids(self):
        self.assertEqual(
            set(layout.PLACES), {"shore", "hill", "garden", "post", "hotel", "harbour", "cedars", "steps", "square"}
        )
        for place in layout.PLACES.values():
            self.assertTrue(place["label"])

    def test_places_sit_on_land_except_the_harbour(self):
        for pid, place in layout.PLACES.items():
            x, y = place["pos"]
            if pid == "harbour":
                self.assertFalse(hm.is_land(x, y), pid)
            else:
                self.assertTrue(hm.is_land(x, y), pid)

    def test_roads_are_on_land(self):
        for x, y in layout.COAST_ROAD + layout.HILL_ROAD:
            self.assertTrue(hm.is_land(x, y), (x, y))

    def test_hill_road_ends_at_the_square(self):
        vx, vy = hm.VILLAGE
        x, y = layout.HILL_ROAD[-1]
        self.assertLess(math.hypot(x - vx, y - vy), layout.SQUARE_RADIUS + 0.2)

    def test_village_houses_are_many_and_do_not_overlap(self):
        houses = layout.village_houses()
        self.assertGreaterEqual(len(houses), 28)
        vx, vy = hm.VILLAGE
        for i, a in enumerate(houses):
            self.assertGreater(math.hypot(a["x"] - vx, a["y"] - vy), layout.SQUARE_RADIUS)
            self.assertTrue(hm.is_land(a["x"], a["y"]))
            for b in houses[i + 1 :]:
                gap = math.hypot(a["x"] - b["x"], a["y"] - b["y"])
                self.assertGreater(gap, (max(a["w"], a["d"]) + max(b["w"], b["d"])) / 2)

    def test_exclusions_cover_every_place_and_house(self):
        zones = layout.exclusions()
        for place in layout.PLACES.values():
            x, y = place["pos"]
            self.assertTrue(any(math.hypot(x - zx, y - zy) <= r for zx, zy, r in zones))
        for h in layout.village_houses():
            self.assertTrue(any(math.hypot(h["x"] - zx, h["y"] - zy) <= r for zx, zy, r in zones))


if __name__ == "__main__":
    unittest.main()
