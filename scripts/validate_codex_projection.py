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
SKILLS_INDEX_PATH = REPO_ROOT / "skills-index.json"
MARKETPLACE_PATH = REPO_ROOT / ".claude-plugin" / "marketplace.json"
CODEX_DIR = REPO_ROOT / "codex"
CODEX_SKILLS_DIR = CODEX_DIR / "skills"
AGENTS_PATH = CODEX_DIR / "AGENTS.md"
BUILD_SCRIPT = REPO_ROOT / "scripts" / "build_codex_projection.py"


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


def validate_inventory(skills_index: dict, marketplace: dict) -> None:
    if not CODEX_SKILLS_DIR.exists():
        fail("codex/skills does not exist. Run scripts/build_codex_projection.py first.")
    if not AGENTS_PATH.exists():
        fail("codex/AGENTS.md does not exist. Run scripts/build_codex_projection.py first.")

    expected_ids = {skill["id"] for skill in skills_index["skills"]}
    actual_ids = {path.name for path in CODEX_SKILLS_DIR.iterdir() if path.is_dir()}

    if expected_ids != actual_ids:
        missing = sorted(expected_ids - actual_ids)
        extra = sorted(actual_ids - expected_ids)
        parts = []
        if missing:
            parts.append(f"missing {missing[:10]}")
        if extra:
            parts.append(f"extra {extra[:10]}")
        fail("codex skill inventory mismatch: " + ", ".join(parts))

    for skill in skills_index["skills"]:
        skill_dir = CODEX_SKILLS_DIR / skill["id"]
        skill_md = skill_dir / "SKILL.md"
        if not skill_md.exists():
            fail(f"Missing {skill_md}")
        source_dir = (REPO_ROOT / skill["path"]).parent
        for reference in skill.get("references", []):
            ref_path = REPO_ROOT / reference
            relative_ref = ref_path.relative_to(source_dir)
            generated_ref = skill_dir / relative_ref
            if not generated_ref.exists():
                fail(f"Missing copied reference {generated_ref}")

    agents_text = AGENTS_PATH.read_text(encoding="utf-8")
    for plugin in marketplace["plugins"]:
        name = plugin["name"]
        if f"`{name}`" not in agents_text:
            fail(f"codex/AGENTS.md does not mention plugin {name}")


def validate_generated_files_match() -> None:
    with tempfile.TemporaryDirectory(prefix="telnyx-codex-validate-") as tmp_dir:
        env = dict(os.environ)
        env["TELNYX_CODEX_OUTPUT_DIR"] = tmp_dir
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

        expected_codex = Path(tmp_dir)
        issues = compare_dirs(expected_codex, CODEX_DIR)
        if issues:
            fail("; ".join(issues))


def main() -> None:
    skills_index = load_json(SKILLS_INDEX_PATH)
    marketplace = load_json(MARKETPLACE_PATH)
    validate_inventory(skills_index, marketplace)
    validate_generated_files_match()
    print("Codex projection validation passed.")


if __name__ == "__main__":
    main()
