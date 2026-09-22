#!/usr/bin/env python3
"""Verify that a staged GStreamer bundle matches its recorded file inventory."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path


UNLISTED_FILES = frozenset({"inventory.json", "registry.bin", "run-probe", "run-probe.cmd"})
SHA256 = re.compile(r"^[0-9a-f]{64}$")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_inventory(root: Path) -> None:
    root = root.resolve(strict=True)
    inventory = json.loads((root / "inventory.json").read_text(encoding="utf-8"))
    if not isinstance(inventory, dict):
        raise ValueError("bundle inventory must be an object")
    if inventory.get("schema_version") != 1:
        raise ValueError("unknown bundle inventory schema")
    records = inventory.get("files")
    if not isinstance(records, list) or not records:
        raise ValueError("bundle inventory has no files")
    recorded: set[str] = set()
    for record in records:
        if not isinstance(record, dict):
            raise ValueError("invalid bundle inventory record")
        name = record.get("path")
        if not isinstance(name, str):
            raise ValueError("bundle inventory record has no path")
        relative = Path(name)
        if (
            relative.is_absolute()
            or not relative.parts
            or any(part in (".", "..") for part in relative.parts)
            or relative.as_posix() != name
            or name in recorded
        ):
            raise ValueError(f"unsafe or duplicate bundle path: {name}")
        recorded.add(name)
        candidate = root / relative
        if candidate.is_symlink() or not candidate.is_file() or root not in candidate.resolve().parents:
            raise ValueError(f"missing or unsafe bundle file: {name}")
        digest = record.get("sha256")
        size = record.get("size_bytes")
        if (
            not isinstance(digest, str)
            or SHA256.fullmatch(digest) is None
            or not isinstance(size, int)
            or isinstance(size, bool)
            or size < 0
        ):
            raise ValueError(f"invalid size or SHA-256 for bundle file: {name}")
        if candidate.stat().st_size != size or file_sha256(candidate) != digest:
            raise ValueError(f"bundle file differs from inventory: {name}")
    actual: set[str] = set()
    for candidate in root.rglob("*"):
        if candidate.is_symlink():
            raise ValueError(f"bundle contains a symlink: {candidate}")
        if candidate.is_file():
            actual.add(candidate.relative_to(root).as_posix())
    unexpected = actual - recorded - UNLISTED_FILES
    missing = recorded - actual
    if unexpected or missing:
        raise ValueError(
            f"bundle contains unlisted or missing files: {sorted(unexpected | missing)}"
        )
    if not (root / "licenses").is_dir() or not any(
        path.startswith("licenses/") for path in recorded
    ):
        raise ValueError("bundle has no license notices")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    args = parser.parse_args()
    try:
        verify_inventory(args.bundle)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"GStreamer bundle inventory verification failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
