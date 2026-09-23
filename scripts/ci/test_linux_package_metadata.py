import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from linux_package_metadata import package_metadata, plugin_scanner

class PackageMetadataTests(unittest.TestCase):
    def test_rpm_provenance_keeps_version_and_license(self):
        with patch('linux_package_metadata.package_manager',return_value='rpm'), patch('linux_package_metadata.command',return_value='gstreamer\t1.28.7-1\tLGPL-2.1-or-later'):
            self.assertEqual(package_metadata(Path('/usr/lib/libgst.so'))['package_license'],'LGPL-2.1-or-later')

    def test_debian_merged_usr_alias_and_multiple_license_notices(self):
        def command(*args):
            import subprocess
            if args[:2]==('dpkg-query','-S'):
                if args[2].startswith('/usr/'):
                    raise subprocess.CalledProcessError(1,args)
                return 'libexample:amd64: /lib/libexample.so'
            return '1.2.3-4'
        with patch('linux_package_metadata.package_manager',return_value='dpkg'), patch('linux_package_metadata.command',side_effect=command), patch.object(Path,'is_file',return_value=True), patch.object(Path,'read_text',return_value='License: LGPL-2.1+\nLicense: BSD-3-Clause\n'):
            metadata=package_metadata(Path('/usr/lib/libexample.so'))
            self.assertEqual(metadata,{'package':'libexample:amd64','package_version':'1.2.3-4','package_license':'BSD-3-Clause; LGPL-2.1+'})

    def test_missing_notice_or_scanner_fails_closed(self):
        with patch('linux_package_metadata.package_manager',return_value='dpkg'), patch('linux_package_metadata.command',return_value='libexample: /lib/libexample.so'), patch.object(Path,'is_file',return_value=False):
            with self.assertRaisesRegex(RuntimeError,'copyright'):
                package_metadata(Path('/lib/libexample.so'))
        with patch('linux_package_metadata.command',return_value=''):
            with self.assertRaisesRegex(RuntimeError,'scanner'):
                plugin_scanner()

    def test_scanner_is_found_from_sdk_not_a_distribution_specific_path(self):
        with tempfile.TemporaryDirectory() as directory:
            scanner=Path(directory)/'gst-plugin-scanner';scanner.touch()
            with patch('linux_package_metadata.command',return_value=directory):
                self.assertEqual(plugin_scanner(),scanner.resolve())
