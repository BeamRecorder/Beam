#!/usr/bin/env python3
"""Stage and relocate a private macOS GStreamer runtime for beam-media-probe."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import plistlib
import shutil
import string
import subprocess
import sys
import tempfile
from pathlib import Path

from check_gstreamer_profile import EXCLUDED_FACTORIES, FACTORIES, PLUGINS, plugin_details
from verify_gstreamer_bundle_inventory import verify_inventory


LAUNCHER = """#!/bin/sh
set -eu
bundle_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
registry_dir=$(mktemp -d)
trap 'rm -f "$registry_dir/registry.bin"; rmdir "$registry_dir"' EXIT
unset DYLD_LIBRARY_PATH DYLD_FALLBACK_LIBRARY_PATH DYLD_FRAMEWORK_PATH DYLD_FALLBACK_FRAMEWORK_PATH
export GST_PLUGIN_SYSTEM_PATH=
export GST_PLUGIN_SYSTEM_PATH_1_0=
export GST_PLUGIN_PATH="$bundle_root/plugins"
export GST_PLUGIN_PATH_1_0="$bundle_root/plugins"
export GST_PLUGIN_SCANNER="$bundle_root/libexec/gst-plugin-scanner"
export GST_PLUGIN_SCANNER_1_0="$bundle_root/libexec/gst-plugin-scanner"
export GST_REGISTRY_1_0="$registry_dir/registry.bin"
"$bundle_root/bin/beam-media-probe" "$@"
"""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as binary:
        for block in iter(lambda: binary.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def run(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args, text=True, encoding="utf-8", errors="replace",
        capture_output=True, check=check
    )


def install_id(binary: Path) -> str | None:
    result = run("otool", "-D", str(binary), check=False)
    lines = result.stdout.splitlines()
    return lines[1].strip() if result.returncode == 0 and len(lines) > 1 else None


def linked_paths(binary: Path) -> list[str]:
    lines = run("otool", "-L", str(binary)).stdout.splitlines()[1:]
    linked = [line.strip().split(" (", 1)[0] for line in lines if line.strip()]
    identity = install_id(binary)
    return [path for path in linked if path != identity]


def embedded_privacy_descriptions(binary: Path) -> dict[str, object]:
    output = run("otool", "-s", "__TEXT", "__info_plist", str(binary)).stdout
    encoded: list[str] = []
    in_section = False
    for line in output.splitlines():
        if "Contents of" in line and "__info_plist" in line:
            in_section = True
            continue
        if not in_section:
            continue
        fields = line.split()
        if len(fields) < 2 or not all(character in string.hexdigits for character in fields[0]):
            break
        encoded.extend(
            field for field in fields[1:]
            if len(field) % 2 == 0 and all(character in string.hexdigits for character in field)
        )
    if not encoded:
        raise RuntimeError(f"missing embedded macOS Info.plist in {binary}")
    try:
        info = plistlib.loads(bytes.fromhex("".join(encoded)).rstrip(b"\0"))
    except (ValueError, plistlib.InvalidFileException) as error:
        raise RuntimeError(f"invalid embedded macOS Info.plist in {binary}: {error}") from error
    if not isinstance(info, dict):
        raise RuntimeError(f"embedded macOS Info.plist is not a dictionary: {binary}")
    for key in (
        "CFBundleIdentifier",
        "NSCameraUsageDescription",
        "NSMicrophoneUsageDescription",
        "NSAudioCaptureUsageDescription",
    ):
        if not isinstance(info.get(key), str) or not info[key].strip():
            raise RuntimeError(f"missing macOS privacy description {key} in {binary}")
    return info


def resolve_dependency(dependency: str, source: Path, framework: Path) -> Path | None:
    if dependency.startswith(("/usr/lib/", "/System/Library/")):
        return None
    version = framework / "Versions/Current"
    if dependency.startswith("@rpath/"):
        candidate = version / "lib" / dependency.removeprefix("@rpath/")
    elif dependency.startswith("@loader_path/"):
        candidate = source.parent / dependency.removeprefix("@loader_path/")
    elif dependency.startswith("@executable_path/"):
        candidate = version / "bin" / dependency.removeprefix("@executable_path/")
    elif dependency.startswith("/"):
        candidate = Path(dependency)
    else:
        raise RuntimeError(f"unknown Mach-O dependency {dependency} in {source}")
    resolved = candidate.resolve(strict=True)
    if framework.resolve() not in resolved.parents:
        raise RuntimeError(f"dependency outside the selected framework: {source}: {dependency}")
    return resolved


def dependency_closure(
    roots: list[Path], framework: Path
) -> tuple[dict[str, Path], set[str]]:
    linked: dict[str, Path] = {}
    external: set[str] = set()
    pending = roots[:]
    seen: set[Path] = set()
    while pending:
        source = pending.pop()
        if source in seen:
            continue
        seen.add(source)
        for dependency in linked_paths(source):
            resolved = resolve_dependency(dependency, source, framework)
            if resolved is None:
                external.add(dependency)
                continue
            previous = linked.setdefault(resolved.name, resolved)
            if previous != resolved:
                raise RuntimeError(f"colliding Mach-O libraries: {previous}, {resolved}")
            pending.append(resolved)
    return linked, external


def relocate(source: Path, destination: Path, framework: Path, root: Path) -> None:
    for dependency in linked_paths(source):
        resolved = resolve_dependency(dependency, source, framework)
        if resolved is None:
            continue
        target = root / "lib" / resolved.name
        relative = os.path.relpath(target, destination.parent).replace(os.sep, "/")
        run("install_name_tool", "-change", dependency, f"@loader_path/{relative}", str(destination))
    if install_id(source) is not None:
        run("install_name_tool", "-id", f"@loader_path/{destination.name}", str(destination))
    run("codesign", "--force", "--sign", "-", str(destination))


def record(source: Path, destination: Path, root: Path) -> dict[str, str | int]:
    return {
        "path": destination.relative_to(root).as_posix(),
        "source_path": str(source),
        "size_bytes": destination.stat().st_size,
        "sha256": sha256(destination),
    }


def copy_notices(
    framework: Path, installer_license: Path, root: Path
) -> list[dict[str, str | int]]:
    names = {"copying", "copying.lesser", "license", "license.txt", "notice", "notice.txt"}
    destination = root / "licenses/gstreamer-installer-license.txt"
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(installer_license.resolve(strict=True), destination)
    notices = [record(installer_license, destination, root)]
    for source in framework.rglob("*"):
        if source.is_file() and source.name.lower() in names:
            destination = root / "licenses/gstreamer" / source.relative_to(framework)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
            notices.append(record(source, destination, root))
    beam_license = Path(__file__).resolve().parents[2] / "LICENSE"
    destination = root / "licenses/beam-LICENSE"
    shutil.copy2(beam_license, destination)
    notices.append(record(beam_license, destination, root))
    return notices


def bundle_environment(root: Path) -> dict[str, str]:
    environment = os.environ.copy()
    for name in (
        "DYLD_LIBRARY_PATH", "DYLD_FALLBACK_LIBRARY_PATH",
        "DYLD_FRAMEWORK_PATH", "DYLD_FALLBACK_FRAMEWORK_PATH",
    ):
        environment.pop(name, None)
    environment.update(
        GST_PLUGIN_SYSTEM_PATH="",
        GST_PLUGIN_SYSTEM_PATH_1_0="",
        GST_PLUGIN_PATH=str(root / "plugins"),
        GST_PLUGIN_PATH_1_0=str(root / "plugins"),
        GST_PLUGIN_SCANNER=str(root / "libexec/gst-plugin-scanner"),
        GST_PLUGIN_SCANNER_1_0=str(root / "libexec/gst-plugin-scanner"),
        GST_REGISTRY_1_0=str(root / "registry.bin"),
    )
    return environment


def inspect(executable: Path, name: str, environment: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(executable), name], env=environment, text=True,
        encoding="utf-8", errors="replace", capture_output=True, check=False
    )


def verify_bundle(root: Path) -> None:
    verify_inventory(root)
    embedded_privacy_descriptions(root / "bin/beam-media-probe")
    binaries = [
        root / "bin/beam-media-probe",
        root / "bin/gst-inspect-1.0",
        root / "libexec/gst-plugin-scanner",
        *sorted((root / "plugins").iterdir()),
        *sorted((root / "lib").iterdir()),
    ]
    for binary in binaries:
        for dependency in linked_paths(binary):
            if dependency.startswith(("/usr/lib/", "/System/Library/")):
                continue
            if not dependency.startswith("@loader_path/"):
                raise RuntimeError(f"unrelocated Mach-O dependency in {binary}: {dependency}")
            resolved = (binary.parent / dependency.removeprefix("@loader_path/")).resolve(strict=True)
            if root.resolve() not in resolved.parents:
                raise RuntimeError(f"Mach-O dependency escaped the private bundle: {binary}: {dependency}")
    environment = bundle_environment(root)
    inspector = root / "bin/gst-inspect-1.0"
    for factory, plugin in FACTORIES.items():
        result = inspect(inspector, factory, environment)
        if result.returncode:
            raise RuntimeError(f"private factory {factory} is unavailable: {result.stderr}")
        details = plugin_details(result.stdout)
        if details["Name"] != plugin or Path(details["Filename"]).resolve().parent != (root / "plugins").resolve():
            raise RuntimeError(f"factory {factory} escaped the private bundle: {details}")
    for factory in EXCLUDED_FACTORIES:
        if inspect(inspector, factory, environment).returncode == 0:
            raise RuntimeError(f"excluded factory {factory} is visible in the private bundle")
    probe = subprocess.run(
        [str(root / "run-probe"), "--help"],
        text=True, capture_output=True, check=False,
    )
    if probe.returncode:
        raise RuntimeError(f"private probe launch failed ({probe.returncode}): {probe.stderr}")


def build(binary: Path, framework: Path, installer_license: Path, output: Path) -> None:
    if platform.system() != "Darwin":
        raise RuntimeError("this bundle builder requires macOS")
    if output.exists():
        raise FileExistsError(f"bundle output already exists: {output}")
    binary = binary.resolve(strict=True)
    framework = framework.resolve(strict=True)
    version = (framework / "Versions/Current").resolve(strict=True)
    inspector = (version / "bin/gst-inspect-1.0").resolve(strict=True)
    scanner_matches = list(version.rglob("gst-plugin-scanner"))
    if len(scanner_matches) != 1:
        raise RuntimeError(f"expected one GStreamer plugin scanner: {scanner_matches}")
    scanner = scanner_matches[0].resolve(strict=True)
    plugins = []
    sources: list[tuple[Path, str]] = []
    versions = set()
    for name in PLUGINS:
        result = inspect(inspector, name, os.environ.copy())
        if result.returncode:
            raise RuntimeError(f"GStreamer plugin {name} is unavailable: {result.stderr}")
        details = plugin_details(result.stdout)
        source = Path(details["Filename"]).resolve(strict=True)
        if details["Name"] != name or not details["License"].upper().startswith("LGPL"):
            raise RuntimeError(f"unexpected plugin identity or license: {name}")
        if framework not in source.parents:
            raise RuntimeError(f"plugin {name} is outside the selected framework: {source}")
        sources.append((source, f"plugins/{source.name}"))
        versions.add(details["Version"])
        plugins.append({"name": name, "version": details["Version"], "license": details["License"]})
    if len(versions) != 1:
        raise RuntimeError(f"mixed GStreamer plugin versions: {sorted(versions)}")
    inputs = [
        (binary, "bin/beam-media-probe"),
        (inspector, "bin/gst-inspect-1.0"),
        (scanner, "libexec/gst-plugin-scanner"),
        *sources,
    ]
    linked, external = dependency_closure([source for source, _ in inputs], framework)
    inputs.extend((source, f"lib/{name}") for name, source in linked.items())
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="beam-gst-macos-", dir=output.parent) as temporary:
        root = Path(temporary)
        files = []
        for source, relative in inputs:
            destination = root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
            relocate(source, destination, framework, root)
            files.append(record(source, destination, root))
        files.extend(copy_notices(framework, installer_license, root))
        launcher = root / "run-probe"
        launcher.write_text(LAUNCHER, encoding="utf-8")
        launcher.chmod(0o755)
        (root / "inventory.json").write_text(
            json.dumps({
                "schema_version": 1,
                "host_os": platform.system(),
                "host_arch": platform.machine(),
                "plugins": plugins,
                "files": files,
                "system_dependencies": sorted(external),
                "license_notices_bundled": True,
            }, indent=2) + "\n", encoding="utf-8"
        )
        verify_bundle(root)
        (root / "registry.bin").unlink(missing_ok=True)
        root.rename(output)
    verify_bundle(output)
    (output / "registry.bin").unlink(missing_ok=True)
    print(f"verified private macOS GStreamer runtime staging: {output}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", required=True, type=Path)
    parser.add_argument("--framework", default="/Library/Frameworks/GStreamer.framework", type=Path)
    parser.add_argument("--installer-license", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        build(args.binary, args.framework, args.installer_license, args.output.resolve())
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"GStreamer macOS bundle build failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
