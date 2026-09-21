import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "check_rust_coverage.py"
SPEC = importlib.util.spec_from_file_location("check_rust_coverage", SCRIPT)
coverage = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(coverage)


class RustCoverageTests(unittest.TestCase):
    def setUp(self):
        self.metadata = {
            "workspace_members": ["one-id", "two-id"],
            "packages": [
                {"id": "one-id", "name": "one", "version": "0.1.0", "manifest_path": "/project/one/Cargo.toml"},
                {"id": "two-id", "name": "two", "version": "0.1.0", "manifest_path": "/project/two/Cargo.toml"},
            ],
        }

    def report(self, one, two):
        return {"data": [{"files": [
            {"filename": "/project/one/src/lib.rs", "summary": {"lines": {"covered": one, "count": 100}}},
            {"filename": "/project/two/src/lib.rs", "summary": {"lines": {"covered": two, "count": 100}}},
            {"filename": "/project/one/test/lib.rs", "summary": {"lines": {"covered": 100, "count": 100}}},
        ]}]}

    def test_all_thresholds_must_pass(self):
        results = coverage.evaluate(self.metadata, self.report(85, 85))
        self.assertTrue(all(result.startswith("PASS") for result in results))

    def test_one_crate_fails_even_when_workspace_passes(self):
        results = coverage.evaluate(self.metadata, self.report(100, 70))
        self.assertEqual(
            [result.split(":")[0] for result in results],
            ["PASS workspace", "PASS one@0.1.0", "FAIL two@0.1.0"],
        )
        self.assertIn("170/200 source lines", results[0])

    def test_zero_coverage_crate_fails(self):
        report = self.report(100, 100)
        report["data"][0]["files"].pop(1)
        results = coverage.evaluate(self.metadata, report)
        self.assertTrue(results[-1].startswith("FAIL two@0.1.0: 0.00%"))


if __name__ == "__main__":
    unittest.main()
