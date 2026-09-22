#!/usr/bin/env python3
"""Stage a relocatable private Windows GStreamer runtime for beam-media-probe."""

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

from check_gstreamer_profile import EXCLUDED_FACTORIES, FACTORIES, PLUGINS, plugin_details
from verify_gstreamer_bundle_inventory import verify_inventory


DLL = re.compile(r"^\s*([A-Za-z0-9_.+-]+\.dll)\s*$", re.IGNORECASE | re.MULTILINE)
VC_RUNTIME = re.compile(r"^(?:vcruntime|msvcp|concrt)", re.IGNORECASE)
LAUNCHER = r"""@echo off
setlocal
set "BUNDLE=%~dp0"
set "PATH=%BUNDLE%bin;%SystemRoot%\System32;%SystemRoot%"
set "GST_PLUGIN_SYSTEM_PATH="
set "GST_PLUGIN_SYSTEM_PATH_1_0="
set "GST_PLUGIN_PATH=%BUNDLE%plugins"
set "GST_PLUGIN_PATH_1_0=%BUNDLE%plugins"
set "GST_PLUGIN_SCANNER=%BUNDLE%libexec\gst-plugin-scanner.exe"
set "GST_PLUGIN_SCANNER_1_0=%GST_PLUGIN_SCANNER%"
set "GST_REGISTRY_1_0=%TEMP%\beam-gst-%RANDOM%-%RANDOM%.bin"
"%BUNDLE%bin\beam-media-probe.exe" %*
set "BEAM_STATUS=%ERRORLEVEL%"
del /q "%GST_REGISTRY_1_0%" 2>nul
exit /b %BEAM_STATUS%
"""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as binary:
        for block in iter(lambda: binary.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def find_dumpbin() -> Path:
    found = shutil.which("dumpbin")
    if found:
        return Path(found)
    program_files = os.environ.get("ProgramFiles(x86)")
    if program_files:
        visual_studio = Path(program_files) / "Microsoft Visual Studio"
        matches = sorted(visual_studio.glob("*/*/VC/Tools/MSVC/*/bin/Hostx64/x64/dumpbin.exe"))
        if matches:
            return matches[-1]
    raise RuntimeError("dumpbin.exe from the MSVC toolchain is unavailable")


def imported_dlls(binary: Path, dumpbin: Path) -> set[str]:
    result = subprocess.run(
        [str(dumpbin), "/dependents", str(binary)],
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=True,
    )
    imports = {name.lower() for name in DLL.findall(result.stdout)}
    if not imports:
        raise RuntimeError(f"no PE imports found for {binary}")
    return imports


def runtime_dlls(directory: Path) -> dict[str, Path]:
    found: dict[str, Path] = {}
    for path in directory.glob("*.dll"):
        name = path.name.lower()
        if name in found:
            raise RuntimeError(f"case-insensitive runtime DLL collision: {path}")
        found[name] = path
    return found


def vc_redist_dlls(program_files: Path, architecture: str) -> dict[str, Path]:
    visual_studio = program_files / "Microsoft Visual Studio"
    directories = sorted(
        visual_studio.glob(f"*/*/VC/Redist/MSVC/*/{architecture}/Microsoft.VC*.CRT")
    )
    if not directories:
        return {}
    return {
        path.name.lower(): path
        for path in directories[-1].glob("*.dll")
        if VC_RUNTIME.match(path.name)
    }


def dependency_closure(
    roots: list[Path], runtime: dict[str, Path], system: Path, dumpbin: Path
) -> tuple[dict[str, Path], set[str]]:
    bundled: dict[str, Path] = {}
    external: set[str] = set()
    pending = roots[:]
    seen: set[Path] = set()
    while pending:
        binary = pending.pop()
        if binary in seen:
            continue
        seen.add(binary)
        for name in imported_dlls(binary, dumpbin):
            if name in runtime:
                source = runtime[name]
                if name not in bundled:
                    bundled[name] = source
                    pending.append(source)
            elif name.startswith(("api-ms-win-", "ext-ms-win-")) or (system / name).is_file():
                if VC_RUNTIME.match(name):
                    raise RuntimeError(f"VC runtime DLL must be bundled: {name}")
                external.add(name)
            else:
                raise RuntimeError(f"unresolved dependency {name} imported by {binary}")
    return bundled, external


def bundle_environment(root: Path) -> dict[str, str]:
    system_root = os.environ.get("SystemRoot", r"C:\Windows")
    environment = os.environ.copy()
    environment["PATH"] = os.pathsep.join(
        (str(root / "bin"), str(Path(system_root) / "System32"), system_root)
    )
    environment.update(
        GST_PLUGIN_SYSTEM_PATH="",
        GST_PLUGIN_SYSTEM_PATH_1_0="",
        GST_PLUGIN_PATH=str(root / "plugins"),
        GST_PLUGIN_PATH_1_0=str(root / "plugins"),
        GST_PLUGIN_SCANNER=str(root / "libexec/gst-plugin-scanner.exe"),
        GST_PLUGIN_SCANNER_1_0=str(root / "libexec/gst-plugin-scanner.exe"),
        GST_REGISTRY_1_0=str(root / "registry.bin"),
    )
    return environment


def inspect(executable: Path, factory: str, environment: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(executable), factory], env=environment, text=True,
        encoding="utf-8", errors="replace", capture_output=True, check=False
    )


def record(source: Path, destination: Path, root: Path) -> dict[str, str | int]:
    return {
        "path": destination.relative_to(root).as_posix(),
        "source_path": str(source),
        "size_bytes": destination.stat().st_size,
        "sha256": sha256(destination),
    }


def copy_notices(runtime_root: Path, root: Path) -> list[dict[str, str | int]]:
    candidates = (
        runtime_root / "share/licenses",
        runtime_root / "share/doc/gstreamer-1.0",
    )
    files = []
    for source_root in candidates:
        if not source_root.is_dir():
            continue
        for source in source_root.rglob("*"):
            if source.is_file():
                destination = root / "licenses" / source_root.name / source.relative_to(source_root)
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination)
                files.append(record(source, destination, root))
    if not files:
        raise RuntimeError("the GStreamer runtime contains no license notices to bundle")
    beam_license = Path(__file__).resolve().parents[2] / "LICENSE"
    destination = root / "licenses/beam-LICENSE"
    shutil.copy2(beam_license, destination)
    files.append(record(beam_license, destination, root))
    return files


def verify_bundle(root: Path, dumpbin: Path) -> None:
    verify_inventory(root)
    environment = bundle_environment(root)
    runtime = runtime_dlls(root / "bin")
    system = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32"
    binaries = [
        root / "bin/beam-media-probe.exe",
        root / "bin/gst-inspect-1.0.exe",
        root / "libexec/gst-plugin-scanner.exe",
        *sorted((root / "plugins").glob("*.dll")),
        *runtime.values(),
    ]
    bundled, _ = dependency_closure(binaries, runtime, system, dumpbin)
    if set(bundled) != set(runtime):
        raise RuntimeError("staged runtime contains unused or unresolved DLLs")
    inspector = root / "bin/gst-inspect-1.0.exe"
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
        [str(root / "bin/beam-media-probe.exe"), "--help"],
        env=environment, text=True, capture_output=True, check=False,
    )
    if probe.returncode:
        raise RuntimeError(f"private probe launch failed ({probe.returncode}): {probe.stderr}")


def build(binary: Path, runtime_root: Path, output: Path) -> None:
    if platform.system() != "Windows":
        raise RuntimeError("this bundle builder requires Windows")
    if output.exists():
        raise FileExistsError(f"bundle output already exists: {output}")
    binary = binary.resolve(strict=True)
    runtime_root = runtime_root.resolve(strict=True)
    runtime_bin = runtime_root / "bin"
    inspector = (runtime_bin / "gst-inspect-1.0.exe").resolve(strict=True)
    scanner_matches = list(runtime_root.rglob("gst-plugin-scanner.exe"))
    if len(scanner_matches) != 1:
        raise RuntimeError(f"expected one GStreamer plugin scanner: {scanner_matches}")
    scanner = scanner_matches[0]
    dumpbin = find_dumpbin()
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
        if runtime_root not in source.parents:
            raise RuntimeError(f"plugin {name} is outside the selected runtime: {source}")
        versions.add(details["Version"])
        sources.append((source, f"plugins/{source.name}"))
        plugins.append({"name": name, "version": details["Version"], "license": details["License"]})
    if len(versions) != 1:
        raise RuntimeError(f"mixed GStreamer plugin versions: {sorted(versions)}")
    inputs = [
        (binary, "bin/beam-media-probe.exe"),
        (inspector, "bin/gst-inspect-1.0.exe"),
        (scanner, "libexec/gst-plugin-scanner.exe"),
        *sources,
    ]
    runtime = runtime_dlls(runtime_bin)
    architecture = "arm64" if platform.machine().lower() == "arm64" else "x64"
    program_files = os.environ.get("ProgramFiles(x86)")
    if program_files:
        for name, source in vc_redist_dlls(Path(program_files), architecture).items():
            runtime.setdefault(name, source)
    system = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32"
    linked, external = dependency_closure([source for source, _ in inputs], runtime, system, dumpbin)
    inputs.extend((source, f"bin/{source.name}") for source in linked.values())
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="beam-gst-windows-", dir=output.parent) as temporary:
        root = Path(temporary)
        files = []
        for source, relative in inputs:
            destination = root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
            files.append(record(source, destination, root))
        files.extend(copy_notices(runtime_root, root))
        (root / "run-probe.cmd").write_text(LAUNCHER, encoding="utf-8")
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
        verify_bundle(root, dumpbin)
        (root / "registry.bin").unlink(missing_ok=True)
        root.rename(output)
    verify_bundle(output, dumpbin)
    (output / "registry.bin").unlink(missing_ok=True)
    print(f"verified private Windows GStreamer runtime staging: {output}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", required=True, type=Path)
    parser.add_argument("--runtime-root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        build(args.binary, args.runtime_root, args.output.resolve())
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"GStreamer Windows bundle build failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
