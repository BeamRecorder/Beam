#!/usr/bin/env python3
"""Run Nextest coverage once and enforce 85% of Rust source lines per crate and workspace."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


MIN_PERCENT = 85


def evaluate(metadata: dict, report: dict) -> list[str]:
    members = set(metadata["workspace_members"])
    crates = {
        package["id"]: (
            f'{package["name"]}@{package["version"]}',
            Path(package["manifest_path"]).parent.resolve() / "src",
        )
        for package in metadata["packages"]
        if package["id"] in members
    }
    totals = {package_id: [0, 0] for package_id in crates}
    seen: set[Path] = set()
    for data in report["data"]:
        for file in data["files"]:
            path = Path(file["filename"]).resolve()
            for package_id, (_, source_root) in crates.items():
                if path.is_relative_to(source_root):
                    if path in seen:
                        raise ValueError(f"duplicate coverage entry for {path}")
                    seen.add(path)
                    lines = file["summary"]["lines"]
                    totals[package_id][0] += lines["covered"]
                    totals[package_id][1] += lines["count"]
                    break
    results = []
    all_covered = sum(value[0] for value in totals.values())
    all_lines = sum(value[1] for value in totals.values())
    crate_results = sorted((crates[package_id][0], value) for package_id, value in totals.items())
    for name, (covered, lines) in [("workspace", (all_covered, all_lines)), *crate_results]:
        passed = lines > 0 and covered * 100 >= MIN_PERCENT * lines
        percentage = 100 * covered / lines if lines else 0
        results.append(f"{'PASS' if passed else 'FAIL'} {name}: {percentage:.2f}% ({covered}/{lines} source lines)")
    return results


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    try:
        subprocess.run(
            [sys.executable, str(root / "scripts/ci/check_rust_test_layout.py"), "--max-errors", "8"],
            cwd=root,
            check=True,
        )
        metadata = json.loads(
            subprocess.check_output(
                ["cargo", "metadata", "--format-version", "1", "--no-deps"], cwd=root, text=True
            )
        )
        target = Path(metadata["target_directory"]).resolve()
        if target.is_relative_to(root):
            raise ValueError(
                f"Cargo target directory {target} is inside the checkout; configure a shared target-dir first"
            )
        report_path = target / "llvm-cov" / "beam-workspace.json"
        report_path.parent.mkdir(parents=True, exist_ok=True)
        command = [
            "cargo", "llvm-cov", "nextest", "--workspace", "--all-features",
            "--json", "--summary-only", "--output-path", str(report_path),
        ]
        subprocess.run(command, cwd=root, check=True)
        results = evaluate(metadata, json.loads(report_path.read_text(encoding="utf-8")))
    except (KeyError, OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"Rust coverage check failed: {error}", file=sys.stderr)
        return 2
    for result in results:
        print(result)
    return 1 if any(result.startswith("FAIL") for result in results) else 0


if __name__ == "__main__":
    sys.exit(main())
