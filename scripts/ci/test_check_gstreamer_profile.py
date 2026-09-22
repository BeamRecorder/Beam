import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from check_gstreamer_profile import plugin_details, plugin_record


class PluginDetailsTests(unittest.TestCase):
    def test_plugin_output_extracts_only_the_plugin_section(self):
        output = """Factory Details:
  Name                     unrelated

Plugin Details:
  Name                     app
  Filename                 /tmp/plugins/libgstapp.so
  Version                  1.28.7
  License                  LGPL

  appsrc: AppSrc
"""
        self.assertEqual(
            plugin_details(output),
            {
                "Name": "app",
                "Filename": "/tmp/plugins/libgstapp.so",
                "Version": "1.28.7",
                "License": "LGPL",
            },
        )

    def test_missing_details_fail_explicitly(self):
        with self.assertRaisesRegex(ValueError, "no Plugin Details"):
            plugin_details("Factory Details:\n  Name       app\n")
        with self.assertRaisesRegex(ValueError, "missing License"):
            plugin_details(
                "Plugin Details:\n  Name     app\n  Filename   /a.so\n  Version   1.28.7\n"
            )

    def test_windows_filename_with_spaces_survives_parsing(self):
        output = (
            "Plugin Details:\r\n"
            "  Name                     vpx\r\n"
            "  Filename                 C:\\Program Files\\GStreamer\\libgstvpx.dll\r\n"
            "  Version                  1.28.7\r\n"
            "  License                  LGPL\r\n"
        )
        self.assertEqual(
            plugin_details(output)["Filename"],
            "C:\\Program Files\\GStreamer\\libgstvpx.dll",
        )

    def test_inventory_records_hash_and_size_of_the_inspected_binary(self):
        with TemporaryDirectory() as temporary:
            source = Path(temporary) / "libgstapp.so"
            source.write_bytes(b"abc")
            record = plugin_record(
                {"Name": "app", "Version": "1.28.7", "License": "LGPL"}, source
            )
        self.assertEqual(record["name"], "app")
        self.assertEqual(record["source_path"], str(source))
        self.assertEqual(record["size_bytes"], 3)
        self.assertEqual(
            record["sha256"],
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        )


if __name__ == "__main__":
    unittest.main()
