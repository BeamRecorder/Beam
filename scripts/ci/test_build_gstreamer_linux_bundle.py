"""Focused checks for private GStreamer runtime staging."""

import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from build_gstreamer_linux_bundle import LAUNCHER, dependencies


class BundleChecks(unittest.TestCase):
    def test_relocated_launcher_uses_its_own_private_paths(self) -> None:
        with tempfile.TemporaryDirectory(prefix="beam bundle moved ") as temporary:
            root = Path(temporary) / "relocated"
            (root / "bin").mkdir(parents=True)
            launcher = root / "run-engine"
            launcher.write_text(LAUNCHER, encoding="utf-8")
            launcher.chmod(0o755)
            probe = root / "bin/beam-media-engine"
            probe.write_text(
                "#!/bin/sh\nprintf '%s\\n' \"$LD_LIBRARY_PATH\" \"$GST_PLUGIN_PATH_1_0\" \"$GST_PLUGIN_SCANNER\" \"$GST_PLUGIN_SYSTEM_PATH_1_0\" \"$1\"\n",
                encoding="utf-8",
            )
            probe.chmod(0o755)
            environment = os.environ.copy()
            environment.pop("LD_LIBRARY_PATH", None)
            result = subprocess.run(
                [str(launcher), "devices"],
                env=environment,
                text=True,
                capture_output=True,
                check=True,
            )
            self.assertEqual(
                result.stdout.splitlines(),
                [
                    str(root / "lib"),
                    str(root / "plugins"),
                    str(root / "libexec/gst-plugin-scanner"),
                    "",
                    "devices",
                ],
            )

    def test_missing_linked_library_fails_before_publishing_a_bundle(self) -> None:
        result = subprocess.CompletedProcess(
            ["ldd", "/tmp/probe"], 0, stdout="libgstapp-1.0.so.0 => not found\n", stderr=""
        )
        with patch("build_gstreamer_linux_bundle.subprocess.run", return_value=result):
            with self.assertRaisesRegex(RuntimeError, "unresolved dependency"):
                dependencies(Path("/tmp/probe"))


if __name__ == "__main__":
    unittest.main()
