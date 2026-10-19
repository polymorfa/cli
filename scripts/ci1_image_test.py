"""Fail-closed admission for the shared, pinned ci-1 image."""
import copy
import datetime
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("ci1_image", pathlib.Path(__file__).with_name("verify-ci1-image.py"))
image = importlib.util.module_from_spec(spec)
spec.loader.exec_module(image)


class AdmissionTest(unittest.TestCase):
    def setUp(self):
        self.now = datetime.datetime(2026, 10, 19, 18, 0, tzinfo=datetime.timezone.utc)
        self.manifest = {
            "built_at": "2026-10-19T14:41:57+00:00",
            "base_fingerprint": "2139edd9da4026da8a66c0557af7eee4789101104eb27860bacd57086219cebb",
            "inputs": {
                "infra/ci1/machine.json": "0900619bac06c6a81f5d7535107985bf8d9cf11c6dd2079273d8ab81d9ebac3a",
                "infra/ci1/tools.lock.json": "4c2a7cac77ebd8221054b2e78dfdd81e15327fb92d3e80d8986a73fb5e326d15",
            },
        }

    def test_qualified_image(self):
        image.validate_image(self.manifest, self.now, "x86_64", 8)

    def test_wrong_shape_or_architecture(self):
        for arch, cpus in [("aarch64", 8), ("x86_64", 4)]:
            with self.subTest(arch=arch, cpus=cpus), self.assertRaises(ValueError):
                image.validate_image(self.manifest, self.now, arch, cpus)

    def test_expired_image_or_future_clock(self):
        for built in ["2026-10-11T18:00:00+00:00", "2026-10-19T18:02:00+00:00", "2026-10-19T14:41:57"]:
            with self.subTest(built=built), self.assertRaises(ValueError):
                image.validate_image({**self.manifest, "built_at": built}, self.now, "x86_64", 8)

    def test_wrong_base(self):
        with self.assertRaises(ValueError):
            image.validate_image({**self.manifest, "base_fingerprint": "0" * 64}, self.now, "x86_64", 8)

    def test_changed_or_missing_definition_and_tools(self):
        for name in self.manifest["inputs"]:
            for value in [None, "0" * 64]:
                bad = copy.deepcopy(self.manifest)
                if value is None:
                    del bad["inputs"][name]
                else:
                    bad["inputs"][name] = value
                with self.subTest(name=name, value=value), self.assertRaises(ValueError):
                    image.validate_image(bad, self.now, "x86_64", 8)
