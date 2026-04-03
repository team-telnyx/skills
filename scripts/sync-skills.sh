#!/bin/bash
# Syncs skills from the canonical skills/ directory to provider plugin directories.
# Flattens the nested structure so skills are at skills/<skill-name>/SKILL.md
# (Claude Code only looks one level deep under skills/).
#
# Source structure:  skills/<group>/skills/<skill-name>/SKILL.md
# Target structure:  providers/<provider>/plugin/skills/<skill-name>/SKILL.md

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_SRC="$REPO_ROOT/skills"

PROVIDERS=(
  "providers/claude/plugin/skills"
  "providers/cursor/plugin/skills"
)

for provider_skills in "${PROVIDERS[@]}"; do
  target="$REPO_ROOT/$provider_skills"
  echo "Syncing skills to $provider_skills ..."
  rm -rf "$target"
  mkdir -p "$target"

  # Flatten: copy each individual skill directory directly into the target
  for skill_group in "$SKILLS_SRC"/*/; do
    # Check if this group has a nested skills/ directory
    if [ -d "$skill_group/skills" ]; then
      # Copy each individual skill from the nested skills/ directory
      for skill_dir in "$skill_group"/skills/*/; do
        [ -d "$skill_dir" ] || continue
        skill_name=$(basename "$skill_dir")
        cp -R "$skill_dir" "$target/$skill_name"
      done
    elif [ -f "$skill_group/SKILL.md" ]; then
      # Skill group IS the skill (no nested skills/ directory)
      group_name=$(basename "$skill_group")
      cp -R "$skill_group" "$target/$group_name"
    fi
  done

  # Also copy any READMEs from skill groups (not individual skills)
  echo "  Done — $(find "$target" -name "SKILL.md" | wc -l | tr -d ' ') skills synced"
done

echo "All providers synced."
