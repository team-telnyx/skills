#!/bin/bash
# Syncs skills from the canonical skills/ directory to provider plugin directories.
# Run this after modifying skills to keep provider plugins in sync.

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
  # Copy each skill group directory
  for skill_group in "$SKILLS_SRC"/*/; do
    group_name=$(basename "$skill_group")
    cp -R "$skill_group" "$target/$group_name"
  done
  echo "  Done — $(find "$target" -name "SKILL.md" | wc -l | tr -d ' ') skills synced"
done

echo "All providers synced."
