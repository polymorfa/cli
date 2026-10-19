#!/usr/bin/env python3
"""Validate the shared ci-1 image before installing CLI dependencies."""
import datetime
import json
import os
import pathlib
import platform

BASE = "2139edd9da4026da8a66c0557af7eee4789101104eb27860bacd57086219cebb"
INPUTS = {
    "infra/ci1/machine.json": "0900619bac06c6a81f5d7535107985bf8d9cf11c6dd2079273d8ab81d9ebac3a",
    "infra/ci1/tools.lock.json": "4c2a7cac77ebd8221054b2e78dfdd81e15327fb92d3e80d8986a73fb5e326d15",
}


def validate_image(data, now, architecture, cpus):
    if architecture != "x86_64" or cpus != 8:
        raise ValueError("ci-1 requires the qualified 8-CPU x86_64 integration VM")
    built = datetime.datetime.fromisoformat(data["built_at"])
    if built.tzinfo is None:
        raise ValueError("ci-1 image timestamp requires a timezone")
    age = now - built
    if age.total_seconds() < -60 or age > datetime.timedelta(days=7):
        raise ValueError("ci-1 image age or clock is invalid; rebuild before running CI")
    if data["base_fingerprint"] != BASE:
        raise ValueError("ci-1 base image does not match the qualified definition")
    for name, expected in INPUTS.items():
        if data["inputs"].get(name) != expected:
            raise ValueError("ci-1 image definition or tools changed; qualify before running CI")


if __name__ == "__main__":
    manifest = pathlib.Path("/etc/ci1-image/input-manifest.json")
    data = json.loads(manifest.read_text())
    validate_image(data, datetime.datetime.now(datetime.timezone.utc), platform.machine(), len(os.sched_getaffinity(0)))
    print("ci-1 image age, base, tool definition and integration VM shape qualified")
