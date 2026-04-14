#!/bin/bash
# telnyx-devkit — CLI for managing analytics opt-in preferences
# Usage:
#   telnyx-devkit analytics --opt-in    Enable analytics (install ffl-cli + telemetry)
#   telnyx-devkit analytics --opt-out   Disable analytics (remove ffl-cli, stop reporting)
#   telnyx-devkit analytics --status    Show current opt-in status
#   telnyx-devkit analytics --reset     Reset to undecided (will prompt again next session)

set -euo pipefail

CONFIG_DIR="${TELNYX_DEVKIT_HOME:-$HOME/.telnyx-devkit}"
CONFIG_FILE="$CONFIG_DIR/config.json"
VERSION=1

# ─── Helpers ──────────────────────────────────────────────────────────────────

init_config() {
  mkdir -p "$CONFIG_DIR"
  if [[ ! -f "$CONFIG_FILE" ]]; then
    cat > "$CONFIG_FILE" <<EOJSON
{
  "analyticsOptIn": null,
  "telemetryEnabled": false,
  "frictionReportingEnabled": false,
  "askedAt": null,
  "version": $VERSION
}
EOJSON
    chmod 600 "$CONFIG_FILE"
  fi
}

read_field() {
  python3 -c "
import json, sys
try:
    with open('$CONFIG_FILE') as f:
        cfg = json.load(f)
    val = cfg.get('$1', None)
    print('null' if val is None else str(val).lower())
except Exception:
    print('null')
"
}

write_field() {
  local key="$1"
  local value="$2"
  python3 -c "
import json, datetime
with open('$CONFIG_FILE') as f:
    cfg = json.load(f)
cfg['$key'] = $value
if '$key' == 'analyticsOptIn':
    cfg['askedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
with open('$CONFIG_FILE', 'w') as f:
    json.dump(cfg, f, indent=2)
"
}

install_ffl_cli() {
  export PATH="$HOME/Library/Python/3.9/bin:$HOME/.local/bin:$PATH"
  if command -v friction-report &>/dev/null; then
    echo "[telnyx-devkit] friction-report already installed"
  else
    echo "[telnyx-devkit] installing friction-report CLI..."
    python3 -m pip install --user --quiet git+ssh://git@github.com/team-telnyx/aifde-ffl-cli.git 2>&1 | tail -3
    if command -v friction-report &>/dev/null; then
      echo "[telnyx-devkit] ✅ friction-report installed"
    else
      echo "[telnyx-devkit] ⚠️  failed to install friction-report"
    fi
  fi
}

uninstall_ffl_cli() {
  export PATH="$HOME/Library/Python/3.9/bin:$HOME/.local/bin:$PATH"
  if command -v friction-report &>/dev/null; then
    echo "[telnyx-devkit] removing friction-report CLI..."
    python3 -m pip uninstall --user --quiet aifde-ffl-cli 2>/dev/null || true
    echo "[telnyx-devkit] ✅ friction-report removed"
  else
    echo "[telnyx-devkit] friction-report not installed, nothing to remove"
  fi
}

# ─── Commands ─────────────────────────────────────────────────────────────────

cmd_opt_in() {
  init_config
  write_field "analyticsOptIn" "True"
  write_field "frictionReportingEnabled" "True"
  write_field "telemetryEnabled" "True"
  install_ffl_cli
  echo ""
  echo "[telnyx-devkit] ✅ Analytics enabled. Thank you for helping improve Telnyx products!"
  echo "[telnyx-devkit]    Friction reporting: ON"
  echo "[telnyx-devkit]    Telemetry: ON"
  echo "[telnyx-devkit]    You can opt out anytime: telnyx-devkit analytics --opt-out"
}

cmd_opt_out() {
  init_config
  write_field "analyticsOptIn" "False"
  write_field "frictionReportingEnabled" "False"
  write_field "telemetryEnabled" "False"
  uninstall_ffl_cli
  echo ""
  echo "[telnyx-devkit] ✅ Analytics disabled. No data will be collected."
  echo "[telnyx-devkit]    Skills work normally without analytics."
  echo "[telnyx-devkit]    You can opt in anytime: telnyx-devkit analytics --opt-in"
}

cmd_status() {
  init_config
  local opt_in
  opt_in=$(read_field "analyticsOptIn")

  echo "[telnyx-devkit] Analytics status:"
  case "$opt_in" in
    "true")
      echo "  Opt-in: ✅ Enabled"
      echo "  Friction reporting: ON"
      echo "  Telemetry: ON"
      echo "  Config: $CONFIG_FILE"
      ;;
    "false")
      echo "  Opt-in: ❌ Disabled"
      echo "  Friction reporting: OFF"
      echo "  Telemetry: OFF"
      echo "  Config: $CONFIG_FILE"
      ;;
    *)
      echo "  Opt-in: ⏳ Not decided yet"
      echo "  Friction reporting: OFF (pending decision)"
      echo "  Telemetry: OFF (pending decision)"
      echo ""
      echo "  To enable:  telnyx-devkit analytics --opt-in"
      echo "  To disable: telnyx-devkit analytics --opt-out"
      ;;
  esac
}

cmd_reset() {
  init_config
  write_field "analyticsOptIn" "None"
  write_field "frictionReportingEnabled" "False"
  write_field "telemetryEnabled" "False"
  echo "[telnyx-devkit] ✅ Analytics preference reset. You will be prompted again next session."
}

# ─── Main ─────────────────────────────────────────────────────────────────────

init_config

case "${1:-} ${2:-}" in
  "analytics --opt-in")  cmd_opt_in ;;
  "analytics --opt-out") cmd_opt_out ;;
  "analytics --status")  cmd_status ;;
  "analytics --reset")   cmd_reset ;;
  *)
    echo "Usage: telnyx-devkit <command>"
    echo ""
    echo "Commands:"
    echo "  analytics --opt-in    Enable analytics (install ffl-cli + telemetry)"
    echo "  analytics --opt-out   Disable analytics (remove ffl-cli, stop reporting)"
    echo "  analytics --status    Show current opt-in status"
    echo "  analytics --reset     Reset to undecided (will prompt again next session)"
    exit 1
    ;;
esac
