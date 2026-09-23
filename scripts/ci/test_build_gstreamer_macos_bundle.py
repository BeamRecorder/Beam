"""Focused checks for macOS Mach-O relocation and private plugin isolation."""

import plistlib
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from build_gstreamer_macos_bundle import (
    LAUNCHER,
    bundle_environment,
    copy_notices,
    dependency_closure,
    embedded_privacy_descriptions,
    linked_paths,
    relocate,
    resolve_dependency,
)


class MacBundleChecks(unittest.TestCase):
    def test_probe_source_plist_declares_all_privacy_reasons(self) -> None:
        source = Path(__file__).resolve().parents[2] / "packages/media-probe/macos/Info.plist"
        with source.open("rb") as file:
            info = plistlib.load(file)
        for key in (
            "CFBundleIdentifier", "NSCameraUsageDescription",
            "NSMicrophoneUsageDescription", "NSAudioCaptureUsageDescription",
        ):
            self.assertTrue(info[key])

    def test_embedded_probe_plist_is_read_from_macho_section(self) -> None:
        info = {
            "CFBundleIdentifier": "app.beam.media-probe",
            "NSCameraUsageDescription": "Camera",
            "NSMicrophoneUsageDescription": "Microphone",
            "NSAudioCaptureUsageDescription": "System audio",
        }
        blob = plistlib.dumps(info)
        lines = [
            "probe:",
            "Contents of (__TEXT,__info_plist) section",
            *(f"{index:016x} {blob[index:index + 16].hex()}" for index in range(0, len(blob), 16)),
        ]
        result = subprocess.CompletedProcess(["otool"], 0, stdout="\n".join(lines), stderr="")
        with patch("build_gstreamer_macos_bundle.run", return_value=result):
            self.assertEqual(embedded_privacy_descriptions(Path("probe")), info)

    def test_embedded_probe_plist_rejects_missing_privacy_reason(self) -> None:
        info = {"CFBundleIdentifier": "app.beam.media-probe"}
        blob = plistlib.dumps(info)
        result = subprocess.CompletedProcess(
            ["otool"], 0,
            stdout=f"probe:\nContents of (__TEXT,__info_plist) section\n00000000 {blob.hex()}\n",
            stderr="",
        )
        with patch("build_gstreamer_macos_bundle.run", return_value=result):
            with self.assertRaisesRegex(RuntimeError, "NSCameraUsageDescription"):
                embedded_privacy_descriptions(Path("probe"))

    def test_otool_output_excludes_dylib_identity(self) -> None:
        binary = Path("libgstreamer.dylib")
        result = subprocess.CompletedProcess(
            ["otool"], 0,
            stdout="libgstreamer.dylib:\n\t/Library/Frameworks/GStreamer.framework/lib/libgstreamer.dylib (compatibility version 1.0.0)\n\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0)\n",
            stderr="",
        )
        with patch("build_gstreamer_macos_bundle.run", return_value=result), patch(
            "build_gstreamer_macos_bundle.install_id",
            return_value="/Library/Frameworks/GStreamer.framework/lib/libgstreamer.dylib",
        ):
            self.assertEqual(linked_paths(binary), ["/usr/lib/libSystem.B.dylib"])

    def test_framework_dependencies_close_transitively(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            framework = Path(temporary) / "GStreamer.framework"
            lib = framework / "Versions/Current/lib"
            lib.mkdir(parents=True)
            probe = Path(temporary) / "probe"
            gst = lib / "libgst.dylib"
            glib = lib / "libglib.dylib"
            for file in (probe, gst, glib):
                file.touch()
            imports = {
                probe: ["@rpath/libgst.dylib", "/usr/lib/libSystem.B.dylib"],
                gst: ["@loader_path/libglib.dylib"],
                glib: [],
            }
            with patch("build_gstreamer_macos_bundle.linked_paths", side_effect=lambda path: imports[path]):
                linked, external = dependency_closure([probe], framework)
            self.assertEqual(linked, {"libgst.dylib": gst, "libglib.dylib": glib})
            self.assertEqual(external, {"/usr/lib/libSystem.B.dylib"})

    def test_dependency_outside_selected_framework_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            framework = root / "GStreamer.framework"
            framework.mkdir()
            outside = root / "liboutside.dylib"
            outside.touch()
            with self.assertRaisesRegex(RuntimeError, "outside the selected framework"):
                resolve_dependency(str(outside), root / "probe", framework)

    def test_relocation_rewrites_framework_link_to_loader_relative_path(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            framework = root / "GStreamer.framework"
            lib = framework / "Versions/Current/lib"
            lib.mkdir(parents=True)
            gst = lib / "libgst.dylib"
            gst.touch()
            source = root / "probe"
            destination = root / "bundle/bin/beam-media-engine"
            old = "@rpath/libgst.dylib"
            calls = []

            def fake_run(*args, **_kwargs):
                calls.append(args)
                return subprocess.CompletedProcess(args, 0, stdout="", stderr="")

            with patch("build_gstreamer_macos_bundle.linked_paths", return_value=[old]), patch(
                "build_gstreamer_macos_bundle.install_id", return_value=None
            ), patch("build_gstreamer_macos_bundle.run", side_effect=fake_run):
                relocate(source, destination, framework, root / "bundle")
            self.assertIn(
                ("install_name_tool", "-change", old, "@loader_path/../lib/libgst.dylib", str(destination)),
                calls,
            )
            self.assertIn(("codesign", "--force", "--sign", "-", str(destination)), calls)

    def test_missing_installer_license_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaises(FileNotFoundError):
                copy_notices(root / "framework", root / "license.txt", root / "bundle")

    def test_official_installer_license_is_copied_and_inventoried(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            license_file = root / "Resources/license.txt"
            license_file.parent.mkdir()
            license_file.write_text("GStreamer LGPL terms", encoding="utf-8")
            records = copy_notices(root / "framework", license_file, root / "bundle")
            self.assertEqual(
                (root / "bundle/licenses/gstreamer-installer-license.txt").read_text(),
                "GStreamer LGPL terms",
            )
            self.assertTrue(
                any(item["path"] == "licenses/gstreamer-installer-license.txt" for item in records)
            )

    def test_launcher_is_relative_to_its_own_location(self) -> None:
        with tempfile.TemporaryDirectory(prefix="beam mac bundle moved ") as temporary:
            root = Path(temporary) / "relocated"
            (root / "bin").mkdir(parents=True)
            launcher = root / "run-engine"
            launcher.write_text(LAUNCHER, encoding="utf-8")
            launcher.chmod(0o755)
            probe = root / "bin/beam-media-engine"
            probe.write_text(
                "#!/bin/sh\nprintf '%s\\n' \"$GST_PLUGIN_PATH_1_0\" \"$GST_PLUGIN_SCANNER\" \"$GST_PLUGIN_SYSTEM_PATH_1_0\" \"$1\"\n",
                encoding="utf-8",
            )
            probe.chmod(0o755)
            result = subprocess.run(
                [str(launcher), "devices"], text=True, capture_output=True, check=True
            )
            self.assertEqual(
                result.stdout.splitlines(),
                [str(root / "plugins"), str(root / "libexec/gst-plugin-scanner"), "", "devices"],
            )

    def test_private_verification_does_not_inherit_dyld_overrides(self) -> None:
        with patch.dict("build_gstreamer_macos_bundle.os.environ", {"DYLD_LIBRARY_PATH": "/host/lib"}):
            environment = bundle_environment(Path("/bundle"))
        self.assertNotIn("DYLD_LIBRARY_PATH", environment)
        self.assertIn("unset DYLD_LIBRARY_PATH", LAUNCHER)


if __name__ == "__main__":
    unittest.main()
