import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "check_rust_test_layout.py"
SPEC = importlib.util.spec_from_file_location("check_rust_test_layout", SCRIPT)
layout = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(layout)


class RustTestLayoutTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "Cargo.toml").write_text(
            '[workspace]\nmembers = ["packages/*"]\n', encoding="utf-8"
        )
        self.crate = self.root / "packages" / "example"
        self.write("packages/example/Cargo.toml", '[package]\nname = "example"\nversion = "0.1.0"\n')

    def write(self, path, contents):
        destination = self.root / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(contents, encoding="utf-8")

    def test_nested_source_requires_exact_mirrored_path(self):
        self.write("packages/example/src/linux/audio.rs", "pub fn capture() {}\n")
        self.write("packages/example/test/audio.rs", "// wrong level\n")
        count, issues = layout.check(self.root)
        self.assertEqual(count, 1)
        self.assertEqual(
            issues,
            ["packages/example/src/linux/audio.rs: missing mirror packages/example/test/linux/audio.rs"],
        )
        self.write("packages/example/test/linux/audio.rs", "// correct level\n")
        self.assertEqual(layout.check(self.root), (1, []))

    def test_rejects_test_attributes_and_modules_inside_src(self):
        self.write(
            "packages/example/src/lib.rs",
            "#[cfg(all(test, unix))]\nmod tests;\n#[tokio::test]\nasync fn broken() {}\n",
        )
        self.write("packages/example/test/lib.rs", "// mirror\n")
        _, issues = layout.check(self.root)
        self.assertEqual(len(issues), 3)
        self.assertTrue(all("in src/" in issue for issue in issues))

    def test_ignores_comments_and_string_literals(self):
        self.write(
            "packages/example/src/lib.rs",
            'let a = "#[test] mod tests;";\n'
            'let b = r###"#[cfg(test)]"###;\n'
            '/* #[test] /* mod tests {} */ */\n'
            '// #[cfg(test)]\n'
            '#[cfg(feature = "test")]\n'
            "pub fn okay() {}\n",
        )
        self.write("packages/example/test/lib.rs", "// mirror\n")
        self.assertEqual(layout.check(self.root), (1, []))

    def test_rejects_test_named_source_without_attributes(self):
        self.write("packages/example/src/linux/tests.rs", "pub fn helper() {}\n")
        self.write("packages/example/test/linux/tests.rs", "// mirror\n")
        _, issues = layout.check(self.root)
        self.assertEqual(issues, ["packages/example/src/linux/tests.rs: test-named file in src/"])


if __name__ == "__main__":
    unittest.main()
