#!/usr/bin/env python3
"""Verify the native writer works with only its explicitly allowed GStreamer plugins."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


PLUGINS = (
    "coreelements",
    "app",
    "videoconvertscale",
    "vpx",
    "matroska",
    "audioconvert",
    "wavenc",
)
FACTORIES = {
    "filesink": "coreelements",
    "appsrc": "app",
    "videoconvert": "videoconvertscale",
    "vp8enc": "vpx",
    "webmmux": "matroska",
    "audioconvert": "audioconvert",
    "wavenc": "wavenc",
}
EXCLUDED_FACTORIES = ("videotestsrc", "x264enc", "avdec_h264")
FIELD = re.compile(r"^\s*(Name|Filename|Version|License)\s{2,}(.+?)\s*$")


def plugin_details(output: str) -> dict[str, str]:
    lines = output.splitlines()
    try:
        start = next(index for index, line in enumerate(lines) if line.strip() == "Plugin Details:")
    except StopIteration as error:
        raise ValueError("gst-inspect output has no Plugin Details section") from error
    details: dict[str, str] = {}
    for line in lines[start + 1 :]:
        if not line.strip() and details:
            break
        match = FIELD.match(line)
        if match:
            details[match.group(1)] = match.group(2)
    for key in ("Name", "Filename", "Version", "License"):
        if not details.get(key):
            raise ValueError(f"gst-inspect output is missing {key}")
    return details


def inspect(name: str, environment: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["gst-inspect-1.0", name],
        env=environment,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )


def plugin_record(details: dict[str, str], source: Path) -> dict[str, str | int]:
    digest = hashlib.sha256()
    with source.open("rb") as binary:
        for chunk in iter(lambda: binary.read(1024 * 1024), b""):
            digest.update(chunk)
    return {
        "name": details["Name"],
        "version": details["Version"],
        "license": details["License"],
        "source_path": str(source),
        "filename": source.name,
        "size_bytes": source.stat().st_size,
        "sha256": digest.hexdigest(),
    }


def verify(command: list[str], inventory_output: Path | None = None) -> None:
    with tempfile.TemporaryDirectory(prefix="beam-gst-profile-") as temporary:
        root = Path(temporary)
        plugin_dir = root / "plugins"
        plugin_dir.mkdir()
        sources: dict[str, Path] = {}
        inventory: list[dict[str, str | int]] = []
        for name in PLUGINS:
            result = inspect(name, os.environ.copy())
            if result.returncode:
                raise RuntimeError(f"GStreamer plugin {name} is unavailable: {result.stderr.strip()}")
            details = plugin_details(result.stdout)
            if details["Name"] != name or not details["License"].upper().startswith("LGPL"):
                raise ValueError(f"unexpected plugin identity or license for {name}: {details}")
            source = Path(details["Filename"]).resolve(strict=True)
            target = plugin_dir / source.name
            if target.exists() and sources.get(name) != source:
                raise ValueError(f"plugin filename collision: {target}")
            shutil.copy2(source, target)
            sources[name] = source
            inventory.append(plugin_record(details, source))
            print(f"{name}: {details['Version']} {details['License']} {source.name}")

        isolated = os.environ.copy()
        isolated["GST_PLUGIN_SYSTEM_PATH_1_0"] = ""
        isolated["GST_PLUGIN_PATH_1_0"] = str(plugin_dir)
        isolated["GST_REGISTRY_1_0"] = str(root / "registry.bin")
        for factory, plugin in FACTORIES.items():
            result = inspect(factory, isolated)
            if result.returncode:
                raise RuntimeError(f"isolated factory {factory} is unavailable: {result.stderr.strip()}")
            details = plugin_details(result.stdout)
            if details["Name"] != plugin:
                raise ValueError(f"factory {factory} came from {details['Name']}, not {plugin}")
            if Path(details["Filename"]).resolve() != (plugin_dir / sources[plugin].name).resolve():
                raise ValueError(f"factory {factory} escaped the private plugin directory")
        for factory in EXCLUDED_FACTORIES:
            if inspect(factory, isolated).returncode == 0:
                raise ValueError(f"excluded factory {factory} is visible in the isolated profile")
        if command:
            subprocess.run(command, env=isolated, check=True)
        if inventory_output is not None:
            inventory_output.parent.mkdir(parents=True, exist_ok=True)
            inventory_output.write_text(
                json.dumps(
                    {
                        "schema_version": 1,
                        "host_os": platform.system(),
                        "host_arch": platform.machine(),
                        "plugins": inventory,
                        "required_factories": FACTORIES,
                        "excluded_factories": EXCLUDED_FACTORIES,
                    },
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )
    print("GStreamer allowlist profile passed")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory-output", type=Path, help="write verified plugin inventory JSON")
    parser.add_argument("command", nargs=argparse.REMAINDER, help="optional command after --")
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    try:
        verify(command, args.inventory_output)
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"GStreamer allowlist check failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
