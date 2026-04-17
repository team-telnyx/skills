#!/bin/bash
# SessionStart hook: initialize analytics preference and install ffl-cli ONLY if opted in

CONFIG_DIR="${TELNYX_AI_HOME:-$HOME/.telnyx-ai}"
CONFIG_FILE="$CONFIG_DIR/config.json"

echo "[telnyx-ai:setup] initializing..." >&2

# ─── Initialize config if needed ──────────────────────────────────────────────

mkdir -p "$CONFIG_DIR"
if [[ ! -f "$CONFIG_FILE" ]]; then
  cat > "$CONFIG_FILE" <<'EOJSON'
{
  "analyticsOptIn": null,
  "telemetryEnabled": false,
  "frictionReportingEnabled": false,
  "askedAt": null,
  "version": 1
}
EOJSON
  chmod 600 "$CONFIG_FILE"
fi

# ─── Persist PATH ─────────────────────────────────────────────────────────────

if [[ -n "${CLAUDE_ENV_FILE:-}" ]]; then
  echo "PATH=$HOME/Library/Python/3.9/bin:$HOME/.local/bin:$PATH" >> "$CLAUDE_ENV_FILE"
  # Also add the telnyx-ai CLI to PATH
  echo "PATH=${CLAUDE_PLUGIN_ROOT:-}/scripts:$PATH" >> "$CLAUDE_ENV_FILE"
fi

# ─── Check TELNYX_API_KEY ────────────────────────────────────────────────────

MISSING_KEY=false
if [[ -n "${TELNYX_API_KEY:-}" ]]; then
  echo "[telnyx-ai:setup] TELNYX_API_KEY found" >&2
  if [[ -n "${CLAUDE_ENV_FILE:-}" ]]; then
    echo "TELNYX_API_KEY=${TELNYX_API_KEY}" >> "$CLAUDE_ENV_FILE"
  fi
else
  MISSING_KEY=true
  echo "[telnyx-ai:setup] WARNING: TELNYX_API_KEY not set." >&2
fi

# ─── Check analytics opt-in preference ───────────────────────────────────────

OPT_IN=$(python3 -c "
import json
try:
    with open('$CONFIG_FILE') as f:
        cfg = json.load(f)
    val = cfg.get('analyticsOptIn')
    print('null' if val is None else str(val).lower())
except Exception:
    print('null')
" 2>/dev/null)

ANALYTICS_UNDECIDED=false
case "$OPT_IN" in
  "true")
    # User opted in — install ffl-cli
    export PATH="$HOME/Library/Python/3.9/bin:$HOME/.local/bin:$PATH"
    if command -v friction-report &>/dev/null; then
      echo "[telnyx-ai:setup] friction-report ready" >&2
    else
      echo "[telnyx-ai:setup] installing friction-report CLI (opted in)..." >&2
      python3 -m pip install --user --quiet "${CLAUDE_PLUGIN_ROOT}/../../../tools/ffl-cli" 2>&1 | tail -3 >&2
      if command -v friction-report &>/dev/null; then
        echo "[telnyx-ai:setup] friction-report installed" >&2
      else
        echo "[telnyx-ai:setup] WARNING: failed to install friction-report" >&2
      fi
    fi
    echo "[telnyx-ai:setup] ✅ Analytics enabled — friction reporting active" >&2
    ;;
  "false")
    # User opted out — skip installation entirely
    echo "[telnyx-ai:setup] Analytics disabled by user. Skipping ffl-cli." >&2
    ;;
  *)
    ANALYTICS_UNDECIDED=true
    echo "[telnyx-ai:setup] ⏳ Analytics not yet configured." >&2
    ;;
esac

# ─── Emit pending requirements to stdout (agent context) ─────────────────────
# IMPORTANT: When multiple setup steps are pending, they are emitted as numbered
# steps. The agent MUST ask the user for each step one at a time, waiting for the
# user's response before proceeding to the next step.

STEP=1

if [[ "$ANALYTICS_UNDECIDED" == "true" ]]; then
  echo ""
  echo "[telnyx-ai] SETUP STEP ${STEP} — ANALYTICS OPT-IN required before first session:"
  echo ""
  echo "Analytics preference has not been set yet."
  echo "→ Present the following box to the user EXACTLY as shown (do NOT paraphrase, do NOT skip the box):"
  echo ""
  echo '  ┌──────────────────────────────────────────────────────────────────┐'
  echo '  │                                                                  │'
  echo '  │   Help improve Telnyx AI tools with anonymous analytics?         │'
  echo '  │                                                                  │'
  echo '  │   We collect friction reports when issues occur:                 │'
  echo '  │     - API errors, parameter mismatches, auth failures            │'
  echo '  │     - Outdated docs, missing examples, workarounds needed        │'
  echo '  │                                                                  │'
  echo '  │   No personal data is collected. You can change this anytime     │'
  echo '  │   by running: telnyx-ai analytics --opt-in/--opt-out             │'
  echo '  │                                                                  │'
  echo '  │   Type yes or no to continue.                                    │'
  echo '  │                                                                  │'
  echo '  └──────────────────────────────────────────────────────────────────┘'
  echo ""
  echo "→ WAIT for the user's response before moving to any next step."
  echo "→ If the user agrees, run:"
  echo "  python3 -c \"import json; f=open('$CONFIG_FILE','r+'); cfg=json.load(f); cfg['analyticsOptIn']=True; cfg['telemetryEnabled']=True; cfg['frictionReportingEnabled']=True; cfg['askedAt']='$(date -u +%Y-%m-%dT%H:%M:%SZ)'; f.seek(0); json.dump(cfg,f,indent=2); f.truncate()\""
  echo "→ If the user declines, run:"
  echo "  python3 -c \"import json; f=open('$CONFIG_FILE','r+'); cfg=json.load(f); cfg['analyticsOptIn']=False; cfg['askedAt']='$(date -u +%Y-%m-%dT%H:%M:%SZ)'; f.seek(0); json.dump(cfg,f,indent=2); f.truncate()\""
  echo ""
  STEP=$((STEP + 1))
fi

if [[ "$MISSING_KEY" == "true" ]]; then
  # Detect user's shell for persistence instructions
  USER_SHELL=$(basename "${SHELL:-/bin/bash}")
  echo ""
  echo "[telnyx-ai] SETUP STEP ${STEP} — ACTION REQUIRED before making any API calls:"
  echo ""
  echo "TELNYX_API_KEY is not set."
  echo "→ Ask the user for their Telnyx API key (portal: https://portal.telnyx.com/#/app/api-keys)."
  echo "→ WAIT for the user's response before moving to any next step."
  echo "→ Once the user provides it, persist it as a shell environment variable AND inject it into the current session."
  echo "→ Run BOTH commands:"
  if [[ "$USER_SHELL" == "fish" ]]; then
    echo "  fish -c 'set -Ux TELNYX_API_KEY <the_key>'"
  elif [[ "$USER_SHELL" == "zsh" ]]; then
    echo "  echo 'export TELNYX_API_KEY=<the_key>' >> ~/.zshrc"
  else
    echo "  echo 'export TELNYX_API_KEY=<the_key>' >> ~/.bashrc"
  fi
  echo "  echo 'TELNYX_API_KEY=<the_key>' >> \$CLAUDE_ENV_FILE"
  echo "→ The first command persists it for future sessions. The second injects it into the current session."
  echo ""
fi

echo "[telnyx-ai:setup] ready" >&2
exit 0
