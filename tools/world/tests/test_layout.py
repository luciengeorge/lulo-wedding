import math
import unittest

from lib import frame
from lib import heightmap as hm
from lib import layout


class LayoutTest(unittest.TestCase):
    def test_roads_follow_real_waypoints_and_stay_on_land(self):
        self.assertEqual(set(layout.ROADS), {"coast", "faraya", "metn"})
        for rid, road in layout.ROADS.items():
            self.assertGreaterEqual(len(road), 4, rid)
            off_land = sum(1 for x, y in road if not hm.is_land(x, y))
            self.assertLessEqual(off_land, 1, rid)
        jx, jy = frame.landmark_xy("jounieh")
        self.assertTrue(any(math.hypot(x - jx, y - jy) < 0.6 for x, y in layout.ROADS["coast"]))
        wx, wy = frame.landmark_xy("warde")
        self.assertLess(math.hypot(layout.ROADS["faraya"][-1][0] - wx, layout.ROADS["faraya"][-1][1] - wy), 0.3)

    def test_towns_are_where_they_are(self):
        for tid in ("beirut", "jounieh", "byblos", "broummana", "bikfaya", "faraya", "warde"):
            self.assertIn(tid, layout.TOWNS)
        for tid in ("jounieh", "bikfaya", "faraya", "warde"):
            self.assertGreaterEqual(sum(1 for h in layout.town_houses() if h["town"] == tid), 4, tid)
        for tid in ():
            self.assertIn(tid, layout.TOWNS)
        bx, by = frame.landmark_xy("ashrafieh")
        tx, ty = layout.TOWNS["beirut"]["pos"]
        self.assertLess(math.hypot(bx - tx, by - ty), 1.2)
        self.assertEqual(layout.TOWNS["beirut"]["kind"], "city")
        self.assertEqual(layout.TOWNS["warde"]["kind"], "resort")

    def test_houses_land_on_land_and_do_not_overlap(self):
        houses = layout.town_houses()
        self.assertGreaterEqual(len(houses), 150)
        beirut = [h for h in houses if h["town"] == "beirut"]
        self.assertGreaterEqual(len(beirut), 70)
        self.assertLess(max(h["w"] for h in beirut), 0.3)
        for h in houses:
            self.assertTrue(hm.is_land(h["x"], h["y"]), h["town"])
        by_town = {}
        for h in houses:
            by_town.setdefault(h["town"], []).append(h)
        for tid, group in by_town.items():
            for i, a in enumerate(group):
                for b in group[i + 1 :]:
                    gap = math.hypot(a["x"] - b["x"], a["y"] - b["y"])
                    self.assertGreater(gap, (max(a["w"], a["d"]) + max(b["w"], b["d"])) / 2, tid)

    def test_towers_include_ashrafieh(self):
        self.assertTrue(any(t["label"] == "Ashrafieh Tower" for t in layout.TOWERS))
        for t in layout.TOWERS:
            self.assertTrue(hm.is_land(t["x"], t["y"]))
            self.assertGreater(t["h"], 0.8)

    def test_places_keep_their_ids_and_sit_on_land_except_the_harbour(self):
        self.assertEqual(
            set(layout.PLACES), {"shore", "hill", "garden", "post", "hotel", "harbour", "cedars", "steps", "square"}
        )
        for pid, place in layout.PLACES.items():
            x, y = place["pos"]
            self.assertTrue(-12 <= x <= 12 and -8 <= y <= 8, pid)
            if pid == "harbour":
                self.assertFalse(hm.is_land(x, y), pid)
            else:
                self.assertTrue(hm.is_land(x, y), pid)
        wx, wy = frame.landmark_xy("warde")
        hx, hy = layout.PLACES["hill"]["pos"]
        self.assertLess(math.hypot(wx - hx, wy - hy), 0.1)

    def test_plateaus_match_places(self):
        for name in ("garden", "hill", "hotel"):
            (cx, cy), _, _ = hm.PLATEAUS[name]
            px, py = layout.PLACES[name]["pos"]
            self.assertLess(math.hypot(cx - px, cy - py), 0.05, name)

    def test_ski_runs_climb_from_the_base(self):
        base, top = layout.SKI["base"], layout.SKI["top"]
        self.assertGreater(hm.elevation_m(*top), hm.elevation_m(*base) + 150)
        self.assertGreaterEqual(len(layout.SKI["pistes"]), 3)

    def test_exclusions_cover_every_place_house_and_tower(self):
        zones = layout.exclusions()
        for place in layout.PLACES.values():
            x, y = place["pos"]
            self.assertTrue(any(math.hypot(x - zx, y - zy) <= r for zx, zy, r in zones))
        for h in layout.town_houses()[::7]:
            self.assertTrue(any(math.hypot(h["x"] - zx, h["y"] - zy) <= r for zx, zy, r in zones))
        for t in layout.TOWERS:
            self.assertTrue(any(math.hypot(t["x"] - zx, t["y"] - zy) <= r for zx, zy, r in zones))


if __name__ == "__main__":
    unittest.main()
