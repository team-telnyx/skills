#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
SKILLS_INDEX_PATH = REPO_ROOT / "skills-index.json"
MARKETPLACE_PATH = REPO_ROOT / ".claude-plugin" / "marketplace.json"
CODEX_DIR = Path(os.environ.get("TELNYX_CODEX_OUTPUT_DIR", str(REPO_ROOT / "codex"))).resolve()
CODEX_SKILLS_DIR = CODEX_DIR / "skills"
AGENTS_PATH = CODEX_DIR / "AGENTS.md"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def clean_output_dir() -> None:
    if CODEX_SKILLS_DIR.exists():
        shutil.rmtree(CODEX_SKILLS_DIR)
    CODEX_SKILLS_DIR.mkdir(parents=True, exist_ok=True)


def copy_skill_directories(skills_index: dict) -> None:
    for skill in skills_index["skills"]:
        source_skill_md = (REPO_ROOT / skill["path"]).resolve()
        source_dir = source_skill_md.parent
        destination_dir = CODEX_SKILLS_DIR / skill["id"]
        shutil.copytree(source_dir, destination_dir)


def build_agents_md(marketplace: dict) -> str:
    bundles = marketplace["plugins"]
    bundle_names = [plugin["name"] for plugin in bundles]

    bundle_lines = "\n".join(f"- `{name}`" for name in bundle_names)
    example_ids = [
        "telnyx-messaging-python",
        "telnyx-voice-javascript",
        "telnyx-numbers-curl",
        "telnyx-webrtc-client-ios",
        "telnyx-twilio-migration",
    ]
    example_lines = "\n".join(f"- `{name}`" for name in example_ids)

    return f"""# Telnyx Skills For Codex

This `codex/` directory is a generated projection of the public Telnyx skills repository for Codex-style installs.

Use these skills when a task involves Telnyx APIs, SDKs, WebRTC client SDKs, or Twilio-to-Telnyx migration work.

Choose the smallest relevant scope:

First choose a bundle:
{bundle_lines}

Then choose the narrowest relevant skill by exact ID, for example:
{example_lines}

Selection rules:

- Match the language bundle to the project stack.
- Prefer one narrow product skill over loading a large set of unrelated skills.
- Use `telnyx-curl` when the user wants REST-first examples or no SDK language is fixed.
- Use `telnyx-webrtc-client` for device-side calling apps and client SDK setup.
- Use `telnyx-twilio-migration` for migration planning, migration execution, or Twilio compatibility questions.
- Use `telnyx-cli` only when the task is specifically about the Telnyx CLI.

Bundle notes:

- `telnyx-python`, `telnyx-javascript`, `telnyx-go`, `telnyx-java`, and `telnyx-ruby` are the server-side SDK bundles.
- `telnyx-curl` is the language-agnostic REST reference bundle.
- `telnyx-webrtc-client` covers JS, iOS, Android, Flutter, and React Native client SDKs.
- `telnyx-twilio-migration` is the cross-product migration guide.

Generated file:

- Do not edit `codex/skills/...` by hand.
- Edit the canonical source skill directories and regenerate this projection instead.
"""


def write_agents_md(marketplace: dict) -> None:
    AGENTS_PATH.write_text(build_agents_md(marketplace), encoding="utf-8")


def main() -> None:
    skills_index = load_json(SKILLS_INDEX_PATH)
    marketplace = load_json(MARKETPLACE_PATH)
    clean_output_dir()
    copy_skill_directories(skills_index)
    write_agents_md(marketplace)


if __name__ == "__main__":
    main()
