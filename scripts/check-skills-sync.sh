#!/bin/bash
# Checks that provider plugin skill directories match the flattened canonical skills.
# The canonical source is skills/<group>/skills/<skill-name>/
# The provider target is providers/<provider>/plugin/skills/<skill-name>/

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_SRC="$REPO_ROOT/skills"
out_of_sync=false

for provider in claude cursor; do
  target="$REPO_ROOT/providers/$provider/plugin/skills"

  if [ ! -d "$target" ]; then
    echo "WARNING: $target does not exist"
    continue
  fi

  # Check each individual skill (flattened)
  for skill_group in "$SKILLS_SRC"/*/; do
    if [ -d "$skill_group/skills" ]; then
      for skill_dir in "$skill_group"/skills/*/; do
        [ -d "$skill_dir" ] || continue
        skill_name="$(basename "$skill_dir")"
        if ! diff -r "$skill_dir" "$target/$skill_name" > /dev/null 2>&1; then
          echo "Out of sync: providers/$provider/plugin/skills/$skill_name"
          out_of_sync=true
        fi
      done
    elif [ -f "$skill_group/SKILL.md" ]; then
      group_name="$(basename "$skill_group")"
      if ! diff -r "$skill_group" "$target/$group_name" > /dev/null 2>&1; then
        echo "Out of sync: providers/$provider/plugin/skills/$group_name"
        out_of_sync=true
      fi
    fi
  done
done

if [ "$out_of_sync" = true ]; then
  echo ""
  echo "Provider skill directories are out of sync with skills/."
  echo "Run: ./scripts/sync-skills.sh"
  exit 1
fi

echo "All provider skill directories are in sync."
