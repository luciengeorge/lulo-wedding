import unittest

from lib import palette


class PaletteTest(unittest.TestCase):
    def test_black_and_white_convert_exactly(self):
        self.assertEqual(palette.hex_to_linear("#000000"), (0.0, 0.0, 0.0))
        self.assertEqual(palette.hex_to_linear("#FFFFFF"), (1.0, 1.0, 1.0))

    def test_srgb_curve_is_applied(self):
        r, g, b = palette.hex_to_linear("#808080")
        self.assertAlmostEqual(r, 0.2158, places=3)
        self.assertEqual(r, g)
        self.assertEqual(g, b)

    def test_tokens_match_styles_css(self):
        self.assertEqual(palette.TOKENS["paper"], "#F9F1E5")
        self.assertEqual(palette.TOKENS["ink"], "#9B0D17")
        self.assertEqual(len(palette.TOKENS), 8)

    def test_mix_endpoints_and_midpoint(self):
        a, b = (0.0, 0.0, 0.0), (1.0, 0.5, 0.0)
        self.assertEqual(palette.mix(a, b, 0.0), a)
        self.assertEqual(palette.mix(a, b, 1.0), b)
        self.assertEqual(palette.mix(a, b, 0.5), (0.5, 0.25, 0.0))

    def test_shade_scales_every_channel(self):
        self.assertEqual(palette.shade((1.0, 0.5, 0.2), 0.5), (0.5, 0.25, 0.1))

    def test_rgba_appends_alpha(self):
        self.assertEqual(palette.rgba((0.1, 0.2, 0.3)), (0.1, 0.2, 0.3, 1.0))
        self.assertEqual(palette.rgba((0.1, 0.2, 0.3), 0.5), (0.1, 0.2, 0.3, 0.5))

    def test_derived_shades_stay_in_range(self):
        for name in ("STONE_DARK", "EARTH", "SAND", "GRASS", "OLIVE", "CYPRESS", "CEDAR", "ROOF", "SEA_DEEP"):
            for channel in getattr(palette, name):
                self.assertGreaterEqual(channel, 0.0, name)
                self.assertLessEqual(channel, 1.0, name)


if __name__ == "__main__":
    unittest.main()
