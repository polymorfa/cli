"""Fail-closed admission for the shared, pinned ci-1 image."""
import copy
import datetime
import importlib.util
import pathlib
import hashlib
import os
import subprocess
import tempfile
import textwrap
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
                "infra/ci1/tools.lock.json": "88d3c9a0e804935c1c7b60ac60d249512309405e150d654de8d896ce68f74f47",
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


class WorkflowAdmissionTest(unittest.TestCase):
    def setUp(self):
        self.workflow = pathlib.Path(__file__).parents[1].joinpath(".github/workflows/ci1.yml").read_text()
        self.scratch = pathlib.Path.home() / ".polymorfa-agent-work" / "cli-ci1-admission-tests"
        self.scratch.mkdir(parents=True, exist_ok=True)

    def test_malformed_checksum_row_fails(self):
        with tempfile.TemporaryDirectory(dir=self.scratch) as directory:
            root = pathlib.Path(directory)
            data = root / "protected-file"
            data.write_bytes(b"qualified bytes")
            record = root / "manifest.sha256"
            record.write_text(hashlib.sha256(data.read_bytes()).hexdigest() + "  " + str(data) + "\n")
            command = next(line.strip().split() for line in self.workflow.splitlines() if line.strip().startswith("sha256sum --check"))
            command[-1] = str(record)
            result = subprocess.run(command, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            record.write_text(record.read_text() + "malformed entry\n")
            result = subprocess.run(command, capture_output=True)
            self.assertNotEqual(result.returncode, 0, result.stdout.decode())

    def test_fork_guard_fails_before_checkout(self):
        marker = "      - name: Require trusted source\n"
        self.assertIn(marker, self.workflow)
        script = self.workflow.split(marker, 1)[1].split("        run: |\n", 1)[1].split("\n      - ", 1)[0]
        script = textwrap.dedent(script)
        for event, head, expected in [("pull_request", "polymorfa/cli", 0), ("push", "", 0), ("pull_request", "external/cli", 1), ("pull_request", "", 1)]:
            with self.subTest(event=event, head=head):
                result = subprocess.run(["bash", "-c", script], env={**os.environ, "EVENT_NAME": event, "HEAD_REPOSITORY": head, "REPOSITORY": "polymorfa/cli"}, capture_output=True)
                self.assertEqual(result.returncode, expected)
        self.assertLess(self.workflow.index(marker), self.workflow.index("      - uses: actions/checkout@"))
