"""Focused checks for the private runtime artifact inventory."""

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from verify_gstreamer_bundle_inventory import verify_inventory


class BundleInventoryChecks(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.binary = self.root / "bin/probe"
        self.binary.parent.mkdir()
        self.binary.write_bytes(b"probe")
        license_file = self.root / "licenses/beam-LICENSE"
        license_file.parent.mkdir()
        license_file.write_text("MIT", encoding="utf-8")
        (self.root / "run-engine").write_text("launcher", encoding="utf-8")
        self.records = [self.record(self.binary), self.record(license_file)]
        self.write_inventory()

    def record(self, path: Path) -> dict[str, str | int]:
        content = path.read_bytes()
        return {
            "path": path.relative_to(self.root).as_posix(),
            "size_bytes": len(content),
            "sha256": hashlib.sha256(content).hexdigest(),
        }

    def write_inventory(self) -> None:
        (self.root / "inventory.json").write_text(
            json.dumps({"schema_version": 1, "files": self.records}), encoding="utf-8"
        )

    def test_matching_inventory_passes(self) -> None:
        verify_inventory(self.root)

    def test_ephemeral_registry_is_allowed(self) -> None:
        (self.root / "registry.bin").write_bytes(b"cache")
        verify_inventory(self.root)

    def test_modified_file_fails(self) -> None:
        self.binary.write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "differs from inventory"):
            verify_inventory(self.root)

    def test_missing_license_fails(self) -> None:
        (self.root / "licenses/beam-LICENSE").unlink()
        with self.assertRaisesRegex(ValueError, "missing or unsafe"):
            verify_inventory(self.root)

    def test_extra_file_fails(self) -> None:
        (self.root / "bin/extra.dll").write_bytes(b"extra")
        with self.assertRaisesRegex(ValueError, "unlisted or missing"):
            verify_inventory(self.root)

    def test_parent_traversal_fails(self) -> None:
        self.records[0]["path"] = "../probe"
        self.write_inventory()
        with self.assertRaisesRegex(ValueError, "unsafe or duplicate"):
            verify_inventory(self.root)

    def test_duplicate_file_fails(self) -> None:
        self.records.append(self.records[0])
        self.write_inventory()
        with self.assertRaisesRegex(ValueError, "unsafe or duplicate"):
            verify_inventory(self.root)

    def test_inventory_must_be_an_object(self) -> None:
        (self.root / "inventory.json").write_text("[]", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "must be an object"):
            verify_inventory(self.root)


if __name__ == "__main__":
    unittest.main()
