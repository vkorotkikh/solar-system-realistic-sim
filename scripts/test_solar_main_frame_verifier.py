"""Keep hardware identity and the frozen one-pixel comparison fail-closed."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

from PIL import Image

spec = importlib.util.spec_from_file_location(
    "solar_frame_verifier", Path(__file__).with_name("verify_solar_main_frame.py")
)
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class HardwareIdentityTests(unittest.TestCase):
    def test_expected_physical_renderer_is_accepted(self):
        verifier.require_hardware("ANGLE D3D12 NVIDIA GeForce RTX 5090", "NVIDIA GeForce RTX 5090")

    def test_software_renderer_cannot_match_a_permissive_expectation(self):
        for renderer in ("ANGLE SwiftShader", "llvmpipe (LLVM)", "softpipe", "Software Rasterizer",
                         "Microsoft Basic Render Driver", "ANGLE WARP"):
            with self.subTest(renderer=renderer), self.assertRaises(ValueError):
                verifier.require_hardware(renderer, renderer)

    def test_missing_mismatched_or_empty_expectation_is_rejected(self):
        for renderer, expected in (("", "NVIDIA"), ("AMD Radeon", "NVIDIA"), ("NVIDIA", "")):
            with self.subTest(renderer=renderer, expected=expected), self.assertRaises(ValueError):
                verifier.require_hardware(renderer, expected)


class PixelContractTests(unittest.TestCase):
    def compare(self, points):
        case = {"samples": [{"name": "limb", "rgb": [210, 85, 80],
                            "footprint_pixels": [[3, 2], [3, 3], [3, 4]],
                            "robust_visibility": False}], "surface_samples": []}
        image = Image.new("RGB", (10, 10))
        for point in points:
            image.putpixel(point, (210, 85, 80))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "capture.png"
            image.save(path)
            return verifier.compare_pixels(path, case)

    def test_exact_footprint_passes(self):
        self.assertTrue(self.compare([(3, 2), (3, 3), (3, 4)])["passed"])

    def test_one_pixel_shift_passes(self):
        self.assertTrue(self.compare([(4, 2), (4, 3), (4, 4)])["passed"])

    def test_two_pixel_shift_fails(self):
        self.assertFalse(self.compare([(5, 2), (5, 3), (5, 4)])["passed"])

    def test_missing_limb_coverage_fails_even_when_centroid_is_one_pixel_away(self):
        self.assertFalse(self.compare([(3, 2)])["passed"])


if __name__ == "__main__":
    unittest.main()
