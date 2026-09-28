#!/usr/bin/env python3
"""Relocate the native UI into Beam's existing private macOS media runtime."""

import argparse
from pathlib import Path

from build_gstreamer_macos_bundle import linked_paths, relocate, resolve_dependency


def stage(binary: Path, runtime: Path, framework: Path) -> None:
    """Require every non-system library before changing or signing the binary."""
    for dependency in linked_paths(binary):
        source = resolve_dependency(dependency, binary, framework)
        if source is not None and not (runtime / "lib" / source.name).is_file():
            raise RuntimeError(f"native UI dependency is absent from the private runtime: {source.name}")
    relocate(binary, binary, framework, runtime)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", required=True, type=Path)
    parser.add_argument("--runtime", required=True, type=Path)
    parser.add_argument("--framework", type=Path, default=Path("/Library/Frameworks/GStreamer.framework"))
    args = parser.parse_args()
    stage(args.binary.resolve(strict=True), args.runtime.resolve(strict=True), args.framework)
