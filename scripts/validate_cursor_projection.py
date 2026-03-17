#!/usr/bin/env python3

from __future__ import annotations

import filecmp
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
MARKETPLACE_PATH = REPO_ROOT / ".claude-plugin" / "marketplace.json"
CURSOR_PLUGIN_PATH = REPO_ROOT / ".cursor-plugin" / "plugin.json"
CURSOR_DIR = REPO_ROOT / "cursor"
CURSOR_RULES_DIR = CURSOR_DIR / "rules"
BUILD_SCRIPT = REPO_ROOT / "scripts" / "build_cursor_projection.py"


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def compare_dirs(expected: Path, actual: Path) -> list[str]:
    issues: list[str] = []
    comparison = filecmp.dircmp(expected, actual)
    if comparison.left_only:
        issues.append(f"Missing generated entries in repo output: {sorted(comparison.left_only)}")
    if comparison.right_only:
        issues.append(f"Unexpected generated entries in repo output: {sorted(comparison.right_only)}")
    if comparison.diff_files:
        issues.append(f"Generated files out of date: {sorted(comparison.diff_files)}")
    for subdir in comparison.common_dirs:
        issues.extend(compare_dirs(expected / subdir, actual / subdir))
    return issues


def validate_inventory(marketplace: dict) -> None:
    if not CURSOR_PLUGIN_PATH.exists():
        fail(".cursor-plugin/plugin.json does not exist.")
    if not CURSOR_RULES_DIR.exists():
        fail("cursor/rules does not exist. Run scripts/build_cursor_projection.py first.")

    cursor_plugin = load_json(CURSOR_PLUGIN_PATH)
    if cursor_plugin.get("rules") != "cursor/rules":
        fail(".cursor-plugin/plugin.json must point to cursor/rules")

    router_path = CURSOR_RULES_DIR / "telnyx-skills-router.mdc"
    if not router_path.exists():
        fail("cursor/rules/telnyx-skills-router.mdc does not exist.")

    router_text = router_path.read_text(encoding="utf-8")
    for plugin in marketplace["plugins"]:
        rule_name = f"{plugin['name']}.mdc"
        rule_path = CURSOR_RULES_DIR / rule_name
        if not rule_path.exists():
            fail(f"Missing cursor bundle rule {rule_path}")
        if f"`{plugin['name']}`" not in router_text:
            fail(f"Cursor router does not mention plugin {plugin['name']}")


def validate_generated_files_match() -> None:
    with tempfile.TemporaryDirectory(prefix="telnyx-cursor-validate-") as tmp_dir:
        env = dict(os.environ)
        env["TELNYX_CURSOR_OUTPUT_DIR"] = tmp_dir
        result = subprocess.run(
            [sys.executable, str(BUILD_SCRIPT)],
            cwd=REPO_ROOT,
            env=env,
            check=False,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            fail(f"Generator failed during validation:\n{result.stderr or result.stdout}")

        expected_cursor = Path(tmp_dir)
        issues = compare_dirs(expected_cursor, CURSOR_DIR)
        if issues:
            fail("; ".join(issues))


def main() -> None:
    marketplace = load_json(MARKETPLACE_PATH)
    validate_inventory(marketplace)
    validate_generated_files_match()
    print("Cursor projection validation passed.")


if __name__ == "__main__":
    main()
