"""Focused checks for the Windows private runtime dependency closure."""

import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from build_gstreamer_windows_bundle import (
    LAUNCHER,
    copy_notices,
    dependency_closure,
    imported_dlls,
    vc_redist_dlls,
)


class WindowsBundleChecks(unittest.TestCase):
    def test_dumpbin_output_extracts_case_insensitive_imports(self) -> None:
        output = """Microsoft (R) COFF/PE Dumper
Image has the following dependencies:

    KERNEL32.dll
    libgstreamer-1.0-0.DLL
    api-ms-win-core-synch-l1-2-0.dll

Summary
"""
        result = subprocess.CompletedProcess(["dumpbin"], 0, stdout=output, stderr="")
        with patch("build_gstreamer_windows_bundle.subprocess.run", return_value=result):
            self.assertEqual(
                imported_dlls(Path("probe.exe"), Path("dumpbin.exe")),
                {"kernel32.dll", "libgstreamer-1.0-0.dll", "api-ms-win-core-synch-l1-2-0.dll"},
            )

    def test_dependency_closure_includes_transitive_runtime_dlls(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            system = root / "System32"
            system.mkdir()
            (system / "kernel32.dll").touch()
            probe = root / "probe.exe"
            gst = root / "libgstreamer.dll"
            glib = root / "libglib.dll"
            for file in (probe, gst, glib):
                file.touch()
            imports = {
                probe: {"libgstreamer.dll", "kernel32.dll"},
                gst: {"libglib.dll"},
                glib: {"api-ms-win-core-file-l1-1-0.dll"},
            }
            with patch("build_gstreamer_windows_bundle.imported_dlls", side_effect=lambda path, _: imports[path]):
                bundled, external = dependency_closure(
                    [probe], {gst.name: gst, glib.name: glib}, system, Path("dumpbin.exe")
                )
            self.assertEqual(bundled, {gst.name: gst, glib.name: glib})
            self.assertEqual(external, {"kernel32.dll", "api-ms-win-core-file-l1-1-0.dll"})

    def test_unresolved_dependency_fails_before_bundle_publication(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            probe = Path(temporary) / "probe.exe"
            probe.touch()
            with patch("build_gstreamer_windows_bundle.imported_dlls", return_value={"lost.dll"}):
                with self.assertRaisesRegex(RuntimeError, "unresolved dependency lost.dll"):
                    dependency_closure([probe], {}, Path(temporary), Path("dumpbin.exe"))

    def test_vc_runtime_cannot_be_assumed_present_on_clean_windows(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe.exe"
            probe.touch()
            (root / "vcruntime140.dll").touch()
            with patch("build_gstreamer_windows_bundle.imported_dlls", return_value={"vcruntime140.dll"}):
                with self.assertRaisesRegex(RuntimeError, "VC runtime DLL must be bundled"):
                    dependency_closure([probe], {}, root, Path("dumpbin.exe"))

    def test_windows_10_ucrt_is_an_operating_system_dependency(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe.exe"
            probe.touch()
            (root / "ucrtbase.dll").touch()
            with patch("build_gstreamer_windows_bundle.imported_dlls", return_value={"ucrtbase.dll"}):
                bundled, external = dependency_closure([probe], {}, root, Path("dumpbin.exe"))
            self.assertEqual(bundled, {})
            self.assertEqual(external, {"ucrtbase.dll"})

    def test_msvc_redist_supplies_runtime_dlls_outside_gstreamer(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            redist = root / "Microsoft Visual Studio/2022/Enterprise/VC/Redist/MSVC/14.44/x64/Microsoft.VC143.CRT"
            redist.mkdir(parents=True)
            runtime = redist / "vcruntime140.dll"
            unrelated = redist / "mfc140.dll"
            runtime.touch()
            unrelated.touch()
            self.assertEqual(vc_redist_dlls(root, "x64"), {"vcruntime140.dll": runtime})

    def test_launcher_confines_runtime_and_plugins_to_its_directory(self) -> None:
        self.assertIn("set \"PATH=%BUNDLE%bin;%SystemRoot%", LAUNCHER)
        self.assertIn("set \"GST_PLUGIN_PATH_1_0=%BUNDLE%plugins\"", LAUNCHER)
        self.assertIn("set \"GST_PLUGIN_SYSTEM_PATH_1_0=\"", LAUNCHER)
        self.assertIn("%BUNDLE%bin\\beam-media-probe.exe", LAUNCHER)

    def test_missing_runtime_notices_fail_before_bundle_publication(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaisesRegex(RuntimeError, "no license notices"):
                copy_notices(root / "runtime", root / "bundle")

    def test_runtime_notices_are_copied_and_inventoried(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "runtime/share/licenses/gstreamer/COPYING"
            source.parent.mkdir(parents=True)
            source.write_text("LGPL", encoding="utf-8")
            records = copy_notices(root / "runtime", root / "bundle")
            self.assertTrue((root / "bundle/licenses/licenses/gstreamer/COPYING").is_file())
            self.assertTrue(any(item["path"] == "licenses/licenses/gstreamer/COPYING" for item in records))


if __name__ == "__main__":
    unittest.main()
