import unittest

from lib import noise


class NoiseTest(unittest.TestCase):
    def test_deterministic(self):
        self.assertEqual(noise.value_noise(1.3, 4.7, seed=9), noise.value_noise(1.3, 4.7, seed=9))
        self.assertEqual(noise.fbm(1.3, 4.7, seed=9), noise.fbm(1.3, 4.7, seed=9))

    def test_seed_changes_output(self):
        self.assertNotEqual(noise.value_noise(1.3, 4.7, seed=1), noise.value_noise(1.3, 4.7, seed=2))

    def test_in_unit_range(self):
        for i in range(200):
            x, y = i * 0.37, i * 0.91
            self.assertTrue(0.0 <= noise.value_noise(x, y) <= 1.0)
            self.assertTrue(0.0 <= noise.fbm(x, y) <= 1.0)

    def test_continuous(self):
        a, b = noise.fbm(2.0, 2.0), noise.fbm(2.001, 2.0)
        self.assertLess(abs(a - b), 0.02)

    def test_not_flat(self):
        values = {round(noise.fbm(i * 0.5, i * 0.25), 3) for i in range(40)}
        self.assertGreater(len(values), 20)


if __name__ == "__main__":
    unittest.main()
