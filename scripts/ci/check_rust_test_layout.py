#!/usr/bin/env python3
"""Check that every workspace Rust source has a mirrored test file outside src/."""

from __future__ import annotations

import argparse
import re
import sys
import tomllib
from pathlib import Path


ATTRIBUTE = re.compile(r"#\s*!?\s*\[")
TEST_MODULE = re.compile(r"\bmod\s+(?:test|tests|[A-Za-z_]\w*_tests?)\b")
TEST_ATTRIBUTE = re.compile(r"^(?:(?:[A-Za-z_]\w*)::)*(?:test|rstest|test_case|quickcheck)\b")
CFG_ATTRIBUTE = re.compile(r"^cfg(?:_attr)?\s*\(")
TEST_WORD = re.compile(r"\btest\b")
RAW_STRING = re.compile(r'(?:br|rb|r)(#{0,255})"')


def mask(source: str) -> str:
    """Blank Rust comments and literals while preserving offsets and line numbers."""
    chars = list(source)

    def blank(start: int, end: int) -> None:
        for offset in range(start, end):
            if chars[offset] != "\n":
                chars[offset] = " "

    index = 0
    while index < len(source):
        if source.startswith("//", index):
            end = source.find("\n", index)
            end = len(source) if end < 0 else end
            blank(index, end)
        elif source.startswith("/*", index):
            depth, end = 1, index + 2
            while end < len(source) and depth:
                if source.startswith("/*", end):
                    depth, end = depth + 1, end + 2
                elif source.startswith("*/", end):
                    depth, end = depth - 1, end + 2
                else:
                    end += 1
            blank(index, end)
        else:
            raw = RAW_STRING.match(source, index)
            if raw and (index == 0 or not (source[index - 1].isalnum() or source[index - 1] == "_")):
                closing = '"' + raw.group(1)
                end = source.find(closing, raw.end())
                end = len(source) if end < 0 else end + len(closing)
                blank(index, end)
            elif source[index] == '"':
                end = index + 1
                while end < len(source):
                    if source[end] == "\\":
                        end += 2
                    elif source[end] == '"':
                        end += 1
                        break
                    else:
                        end += 1
                blank(index, min(end, len(source)))
            elif source[index] == "'" and re.match(r"'(?:\\.|[^'\\\n])'", source[index:]):
                end = index + (4 if source[index + 1] == "\\" else 3)
                blank(index, end)
            else:
                index += 1
                continue
        index = end
    return "".join(chars)


def test_markers(source: str) -> list[tuple[int, str]]:
    code = mask(source)
    markers: list[tuple[int, str]] = []
    for match in ATTRIBUTE.finditer(code):
        depth, end = 1, match.end()
        while end < len(code) and depth:
            if code[end] == "[":
                depth += 1
            elif code[end] == "]":
                depth -= 1
            end += 1
        body = code[match.end() : end - 1].strip() if depth == 0 else ""
        if TEST_ATTRIBUTE.match(body) or (CFG_ATTRIBUTE.match(body) and TEST_WORD.search(body)):
            markers.append((source.count("\n", 0, match.start()) + 1, "test attribute in src/"))
    for match in TEST_MODULE.finditer(code):
        markers.append((source.count("\n", 0, match.start()) + 1, "test module in src/"))
    return markers


def workspace_crates(root: Path) -> list[Path]:
    manifest = root / "Cargo.toml"
    if not manifest.is_file():
        raise ValueError(f"missing workspace manifest: {manifest}")
    data = tomllib.loads(manifest.read_text(encoding="utf-8"))
    crates = {root} if "package" in data else set()
    for pattern in data.get("workspace", {}).get("members", []):
        for candidate in root.glob(pattern):
            if (candidate / "Cargo.toml").is_file():
                crates.add(candidate)
    if not crates:
        raise ValueError(f"no Rust crates found in {manifest}")
    return sorted(crates)


def check(root: Path) -> tuple[int, list[str]]:
    issues: list[str] = []
    count = 0
    for crate in workspace_crates(root):
        for source in sorted((crate / "src").rglob("*.rs")):
            count += 1
            relative = source.relative_to(crate / "src")
            display = source.relative_to(root)
            mirror = crate / "test" / relative
            if not mirror.is_file():
                issues.append(f"{display}: missing mirror {mirror.relative_to(root)}")
            if any(part in ("test", "tests") for part in relative.parts[:-1]) or re.search(
                r"(?:^|_)tests?\.rs$", relative.name
            ):
                issues.append(f"{display}: test-named file in src/")
            for line, description in test_markers(source.read_text(encoding="utf-8")):
                issues.append(f"{display}:{line}: {description}")
    return count, issues


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--max-errors", type=int, default=40, help="0 prints every issue")
    args = parser.parse_args()
    if args.max_errors < 0:
        parser.error("--max-errors must be non-negative")
    try:
        count, issues = check(args.root.resolve())
    except (OSError, ValueError, tomllib.TOMLDecodeError) as error:
        print(f"Rust test layout check failed: {error}", file=sys.stderr)
        return 2
    limit = args.max_errors or len(issues)
    for issue in issues[:limit]:
        print(issue)
    if len(issues) > limit:
        print(f"... {len(issues) - limit} more issues; use --max-errors 0 to show all")
    print(f"Checked {count} Rust source files across the workspace: {len(issues)} issue(s).")
    return 1 if issues else 0


if __name__ == "__main__":
    sys.exit(main())
