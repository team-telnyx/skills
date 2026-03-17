#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import shutil
from collections import defaultdict
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
SKILLS_INDEX_PATH = REPO_ROOT / "skills-index.json"
MARKETPLACE_PATH = REPO_ROOT / ".claude-plugin" / "marketplace.json"
CURSOR_DIR = Path(os.environ.get("TELNYX_CURSOR_OUTPUT_DIR", str(REPO_ROOT / "cursor"))).resolve()
CURSOR_RULES_DIR = CURSOR_DIR / "rules"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def clean_output_dir() -> None:
    if CURSOR_RULES_DIR.exists():
        shutil.rmtree(CURSOR_RULES_DIR)
    CURSOR_RULES_DIR.mkdir(parents=True, exist_ok=True)


def slugify(name: str) -> str:
    return name.lower().replace(" ", "-")


def write_rule(path: Path, description: str, body: str, always_apply: bool = False) -> None:
    frontmatter = [
        "---",
        f"description: {description}",
        f"alwaysApply: {'true' if always_apply else 'false'}",
        "---",
        "",
    ]
    path.write_text("\n".join(frontmatter) + body.rstrip() + "\n", encoding="utf-8")


def build_router_rule(marketplace: dict) -> str:
    bundle_lines = "\n".join(
        f"- `{plugin['name']}`: {plugin['description']}" for plugin in marketplace["plugins"]
    )
    return f"""# Telnyx Router

Use these rules when the task involves Telnyx APIs, SDKs, WebRTC client SDKs, or Twilio-to-Telnyx migration.

Choose one bundle first:
{bundle_lines}

Selection rules:

- Match the bundle to the user's stack before loading more context.
- Prefer the narrowest product skill inside that bundle.
- Use `telnyx-curl` for REST-first examples or when no SDK language is fixed.
- Use `telnyx-webrtc-client` for device-side calling apps.
- Use `telnyx-twilio-migration` for migration planning or execution.
- Use `telnyx-cli` only for Telnyx CLI tasks.

Generated file:

- Do not edit `cursor/rules/*.mdc` by hand.
- Edit the canonical root plugin directories and regenerate this projection instead.
"""


def build_bundle_rule(plugin: dict, skills: list[dict]) -> str:
    example_ids = "\n".join(f"- `{skill['id']}`" for skill in skills[:12])
    if len(skills) > 12:
        example_ids += f"\n- ... plus {len(skills) - 12} more skills in this bundle"

    return f"""# {plugin['name']}

Use this bundle when: {plugin['description']}

Available skills in this bundle include:
{example_ids}

Selection rules:

- Load only the exact skill IDs needed for the current task.
- Prefer product-specific skills such as `telnyx-messaging-python` over broad bundle context.
- Fall back to adjacent skills in this bundle only when the task clearly spans multiple Telnyx products.
"""


def write_rules(skills_index: dict, marketplace: dict) -> None:
    skills_by_plugin: dict[str, list[dict]] = defaultdict(list)
    for skill in skills_index["skills"]:
        skills_by_plugin[skill["plugin"]].append(skill)

    router_path = CURSOR_RULES_DIR / "telnyx-skills-router.mdc"
    write_rule(
        router_path,
        "Router for Telnyx skills. Chooses the right Telnyx bundle and scope for the task.",
        build_router_rule(marketplace),
        always_apply=True,
    )

    for plugin in marketplace["plugins"]:
        plugin_name = plugin["name"]
        rule_path = CURSOR_RULES_DIR / f"{slugify(plugin_name)}.mdc"
        plugin_skills = sorted(skills_by_plugin.get(plugin_name, []), key=lambda item: item["id"])
        write_rule(
            rule_path,
            f"Use for {plugin_name} tasks.",
            build_bundle_rule(plugin, plugin_skills),
        )


def main() -> None:
    skills_index = load_json(SKILLS_INDEX_PATH)
    marketplace = load_json(MARKETPLACE_PATH)
    clean_output_dir()
    write_rules(skills_index, marketplace)


if __name__ == "__main__":
    main()
