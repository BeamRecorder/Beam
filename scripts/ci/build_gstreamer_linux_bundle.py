#!/usr/bin/env python3
"""Stage and verify a private Linux GStreamer runtime for beam-media-probe."""

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

from check_gstreamer_profile import (
    EXCLUDED_FACTORIES,
    FACTORIES,
    PLUGINS,
    inspect,
    plugin_details,
)
from verify_gstreamer_bundle_inventory import verify_inventory


SYSTEM_LIBRARIES = frozenset(
    {
        "libasound.so.2",
        "libblkid.so.1",
        "libc.so.6",
        "libdrm.so.2",
        "libgcc_s.so.1",
        "libm.so.6",
        "libmount.so.1",
        "libpcre2-8.so.0",
        "libpipewire-0.3.so.0",
        "libselinux.so.1",
        "libz.so.1",
    }
)
LINKED_LIBRARY = re.compile(r"^\s*(\S+)\s+=>\s+(\S+)")
LAUNCHER = """#!/bin/sh
set -eu
bundle_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
registry_dir=$(mktemp -d)
trap 'rm -f "$registry_dir/registry.bin"; rmdir "$registry_dir"' EXIT
export LD_LIBRARY_PATH="$bundle_root/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export GST_PLUGIN_SYSTEM_PATH=
export GST_PLUGIN_SYSTEM_PATH_1_0=
export GST_PLUGIN_PATH="$bundle_root/plugins"
export GST_PLUGIN_PATH_1_0="$bundle_root/plugins"
export GST_PLUGIN_SCANNER="$bundle_root/libexec/gst-plugin-scanner"
export GST_PLUGIN_SCANNER_1_0="$bundle_root/libexec/gst-plugin-scanner"
export GST_REGISTRY_1_0="$registry_dir/registry.bin"
"$bundle_root/bin/beam-media-probe" "$@"
"""


def dependencies(binary: Path, environment: dict[str, str] | None = None) -> dict[str, Path]:
    result = subprocess.run(
        ["ldd", str(binary)],
        env=environment,
        text=True,
        capture_output=True,
        check=True,
    )
    if "not found" in result.stdout:
        raise RuntimeError(f"unresolved dependency for {binary}: {result.stdout}")
    found: dict[str, Path] = {}
    for line in result.stdout.splitlines():
        match = LINKED_LIBRARY.match(line)
        if match and match.group(2).startswith("/"):
            found[match.group(1)] = Path(match.group(2))
    return found


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def package_metadata(source: Path) -> dict[str, str]:
    result = subprocess.run(
        [
            "rpm", "-qf", "--queryformat",
            "%{NAME}\t%{VERSION}-%{RELEASE}\t%{LICENSE}\n", str(source),
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    fields = result.stdout.strip().split("\t")
    if result.returncode or len(fields) != 3:
        raise RuntimeError(f"no RPM license metadata for {source}: {result.stderr.strip()}")
    return {"package": fields[0], "package_version": fields[1], "package_license": fields[2]}


def record(source: Path, destination: Path, root: Path) -> dict[str, str | int]:
    return {
        "path": destination.relative_to(root).as_posix(),
        "source_path": str(source),
        "size_bytes": destination.stat().st_size,
        "sha256": sha256(destination),
        **package_metadata(source),
    }


def copy_licenses(packages: set[str], root: Path) -> list[str]:
    missing = []
    for package in sorted(packages):
        result = subprocess.run(
            ["rpm", "-ql", package], text=True, capture_output=True, check=True
        )
        licenses = [Path(line) for line in result.stdout.splitlines() if "/share/licenses/" in line]
        copied = 0
        for source in licenses:
            if source.is_file():
                destination = root / "licenses" / source.relative_to("/usr/share/licenses")
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination)
                copied += 1
        if copied == 0:
            missing.append(package)
    return missing


def verify_bundle(root: Path) -> None:
    verify_inventory(root)
    environment = os.environ.copy()
    environment["LD_LIBRARY_PATH"] = str(root / "lib")
    environment["GST_PLUGIN_SYSTEM_PATH"] = ""
    environment["GST_PLUGIN_SYSTEM_PATH_1_0"] = ""
    environment["GST_PLUGIN_PATH"] = str(root / "plugins")
    environment["GST_PLUGIN_PATH_1_0"] = str(root / "plugins")
    environment["GST_PLUGIN_SCANNER"] = str(root / "libexec/gst-plugin-scanner")
    environment["GST_PLUGIN_SCANNER_1_0"] = environment["GST_PLUGIN_SCANNER"]
    environment["GST_REGISTRY_1_0"] = str(root / "registry.bin")
    binaries = [
        *sorted((root / "bin").iterdir()),
        *sorted((root / "plugins").iterdir()),
        root / "libexec/gst-plugin-scanner",
    ]
    for binary in binaries:
        for name, path in dependencies(binary, environment).items():
            if name not in SYSTEM_LIBRARIES and path.parent != root / "lib":
                raise RuntimeError(f"{binary.name} loads {name} outside the private bundle: {path}")
    inspector = root / "bin/gst-inspect-1.0"
    for factory, plugin in FACTORIES.items():
        result = subprocess.run(
            [str(inspector), factory],
            env=environment,
            text=True,
            capture_output=True,
            check=True,
        )
        details = plugin_details(result.stdout)
        if details["Name"] != plugin or Path(details["Filename"]).parent != root / "plugins":
            raise RuntimeError(f"factory {factory} escaped the private bundle: {details}")
    for factory in EXCLUDED_FACTORIES:
        result = subprocess.run(
            [str(inspector), factory],
            env=environment,
            capture_output=True,
            check=False,
        )
        if result.returncode == 0:
            raise RuntimeError(f"excluded factory {factory} is visible in the private bundle")
    launch = subprocess.run(
        [str(root / "run-probe"), "--help"], text=True, capture_output=True, check=False
    )
    if launch.returncode:
        raise RuntimeError(f"private probe launch failed ({launch.returncode}): {launch.stderr}")


def build(binary: Path, output: Path) -> None:
    if platform.system() != "Linux":
        raise RuntimeError("this bundle builder requires Linux")
    if shutil.which("rpm") is None:
        raise RuntimeError("this bundle builder requires RPM package metadata")
    if output.exists():
        raise FileExistsError(f"bundle output already exists: {output}")
    binary = binary.resolve(strict=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="beam-gst-bundle-", dir=output.parent) as temporary:
        root = Path(temporary)
        for directory in ("bin", "lib", "plugins", "libexec"):
            (root / directory).mkdir()
        scanner = Path("/usr/libexec/gstreamer-1.0/gst-plugin-scanner").resolve(strict=True)
        inspector_command = shutil.which("gst-inspect-1.0")
        if inspector_command is None:
            raise RuntimeError("gst-inspect-1.0 is unavailable")
        inspector = Path(inspector_command).resolve(strict=True)
        inputs: list[tuple[Path, Path]] = [
            (binary, root / "bin/beam-media-probe"),
            (inspector, root / "bin/gst-inspect-1.0"),
            (scanner, root / "libexec/gst-plugin-scanner"),
        ]
        plugins = []
        versions = set()
        for name in PLUGINS:
            result = inspect(name, os.environ.copy())
            if result.returncode:
                raise RuntimeError(f"GStreamer plugin {name} is unavailable: {result.stderr}")
            details = plugin_details(result.stdout)
            if details["Name"] != name or not details["License"].upper().startswith("LGPL"):
                raise RuntimeError(f"unexpected plugin identity or license: {name}")
            versions.add(details["Version"])
            source = Path(details["Filename"]).resolve(strict=True)
            inputs.append((source, root / "plugins" / source.name))
            plugins.append(
                {"name": name, "version": details["Version"], "license": details["License"]}
            )
        if len(versions) != 1:
            raise RuntimeError(f"mixed GStreamer plugin versions: {sorted(versions)}")
        linked = {}
        external = {}
        for source, _ in inputs:
            for name, path in dependencies(source).items():
                if name in SYSTEM_LIBRARIES:
                    external[name] = str(path)
                    continue
                previous = linked.setdefault(name, path)
                if previous.resolve() != path.resolve():
                    raise RuntimeError(f"conflicting libraries named {name}: {previous}, {path}")
        inputs.extend((path, root / "lib" / name) for name, path in sorted(linked.items()))
        files = []
        packages = set()
        for source, destination in inputs:
            shutil.copy2(source, destination)
            metadata = (
                record(source, destination, root)
                if source != binary
                else {
                    "path": destination.relative_to(root).as_posix(),
                    "source_path": str(source),
                    "size_bytes": destination.stat().st_size,
                    "sha256": sha256(destination),
                    "package": "beam",
                    "package_license": "MIT",
                }
            )
            files.append(metadata)
            if metadata["package"] != "beam":
                packages.add(str(metadata["package"]))
        missing_notices = copy_licenses(packages, root)
        if missing_notices:
            raise RuntimeError(f"missing installed RPM license notices: {missing_notices}")
        shutil.copy2(
            Path(__file__).resolve().parents[2] / "LICENSE",
            root / "licenses/beam-LICENSE",
        )
        for notice in sorted((root / "licenses").rglob("*")):
            if notice.is_file():
                files.append(
                    {
                        "path": notice.relative_to(root).as_posix(),
                        "size_bytes": notice.stat().st_size,
                        "sha256": sha256(notice),
                    }
                )
        launcher = root / "run-probe"
        launcher.write_text(LAUNCHER, encoding="utf-8")
        launcher.chmod(0o755)
        (root / "inventory.json").write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "host_os": platform.system(),
                    "host_arch": platform.machine(),
                    "plugins": plugins,
                    "files": files,
                    "system_dependencies": external,
                    "missing_license_notices": missing_notices,
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        verify_bundle(root)
        (root / "registry.bin").unlink(missing_ok=True)
        root.rename(output)
    verify_bundle(output)
    (output / "registry.bin").unlink(missing_ok=True)
    print(f"verified private GStreamer runtime staging: {output}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--binary", required=True, type=Path, help="compiled beam-media-probe executable"
    )
    parser.add_argument("--output", required=True, type=Path, help="new bundle directory")
    args = parser.parse_args()
    try:
        build(args.binary, args.output.resolve())
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"GStreamer bundle build failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
