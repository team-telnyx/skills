#!/usr/bin/env bash
# runner.sh — Step-by-step orchestrator for Twilio→Telnyx migration
#
# Commands:
#   runner.sh --init <project-root>          Initialize workflow state
#   runner.sh --next                         Execute or output the next step
#   runner.sh --done <step-id>               Mark an AGENT step as complete
#   runner.sh --set <key> <value>            Set a value (for INPUT steps)
#   runner.sh --status                       Show current position and progress
#   runner.sh --retry                        Re-run the current failed step

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNNER_STATE_FILE=".migration-runner-state.json"

# Source workflow definitions
source "$SCRIPT_DIR/workflow.sh"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

die() { echo "ERROR: $*" >&2; exit 1; }

ensure_jq() {
  command -v jq >/dev/null 2>&1 || die "jq is required. Install: brew install jq"
}

runner_state_path() {
  echo "${PROJECT_ROOT:?}/${RUNNER_STATE_FILE}"
}

# Atomic write: write to temp file then move
atomic_write() {
  local target="$1"
  local content="$2"
  local tmp="${target}.tmp.$$"
  echo "$content" > "$tmp"
  mv "$tmp" "$target"
}

# Print step header
print_header() {
  local step_id="$1"
  local step_num="$2"
  local total="$3"
  local phase="$4"
  local retry_info="${5:-}"

  local phase_name
  phase_name=$(get_phase_name "$phase")

  echo ""
  echo "════════════════════════════════════════════════════"
  if [[ -n "$retry_info" ]]; then
    echo "STEP: ${step_id} (${step_num} of ${total}) — ${retry_info}"
  else
    echo "STEP: ${step_id} (${step_num} of ${total})"
  fi
  echo "PHASE: ${phase} — ${phase_name}"
  echo "════════════════════════════════════════════════════"
  echo ""
}

# ---------------------------------------------------------------------------
# State management
# ---------------------------------------------------------------------------

load_runner_state() {
  local path
  path=$(runner_state_path)
  [[ -f "$path" ]] || die "No runner state at $path — run --init first"
  # Validate JSON
  jq '.' "$path" >/dev/null 2>&1 || die "Runner state file is corrupted: $path"
}

get_runner_value() {
  local key="$1"
  local path
  path=$(runner_state_path)
  jq -r ".$key // empty" "$path"
}

set_runner_value() {
  local key="$1"
  local value="$2"
  local path
  path=$(runner_state_path)
  local now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local tmp
  if [[ "$value" =~ ^[0-9]+$ ]] || [[ "$value" == "true" ]] || [[ "$value" == "false" ]] || [[ "$value" == "null" ]]; then
    tmp=$(jq --arg t "$now" ".$key = $value | .updated_at = \$t" "$path")
  else
    tmp=$(jq --arg t "$now" --arg v "$value" ".$key = \$v | .updated_at = \$t" "$path")
  fi
  atomic_write "$path" "$tmp"
}

# ---------------------------------------------------------------------------
# Step list management
# ---------------------------------------------------------------------------

# Build the full step list (static + dynamic), stored in runner state
build_step_list() {
  # Build steps in correct execution order:
  # 1. Static steps phases 0-3 + phase4_gate
  # 2. Dynamic phase4 steps (migrate/lint/validate/commit per product)
  # 3. phase4_env_audit
  # 4. phase5_gate, phase5_run_validation, phase5_run_lint
  # 5. Dynamic phase5 test steps
  # 6. Static steps phase6_*

  local ordered_ids=()
  local ordered_types=()
  local ordered_phases=()
  local ordered_prereqs=()

  # Helper to append a step
  _append_step() {
    ordered_ids+=("$1"); ordered_types+=("$2"); ordered_phases+=("$3"); ordered_prereqs+=("$4")
  }

  # Parse static steps into associative-like parallel arrays
  local static_ids=() static_types=() static_phases=() static_prereqs=()
  while IFS='|' read -r id type phase prereqs; do
    [[ -n "$id" ]] || continue
    static_ids+=("$id")
    static_types+=("$type")
    static_phases+=("$phase")
    static_prereqs+=("$prereqs")
  done <<< "$(get_static_steps)"

  # Parse dynamic steps if scan file exists
  local dyn_ids=() dyn_types=() dyn_phases=() dyn_prereqs=()
  local dynamic_env_audit_prereq=""
  local dynamic_phase6_gate_prereq=""
  local scan_file="${PROJECT_ROOT}/twilio-scan.json"

  if [[ -f "$scan_file" ]]; then
    while IFS='|' read -r id rest; do
      [[ -n "$id" ]] || continue
      if [[ "$id" == "__SET_ENV_AUDIT_PREREQ__" ]]; then
        dynamic_env_audit_prereq="$rest"; continue
      fi
      if [[ "$id" == "__SET_PHASE6_GATE_PREREQ__" ]]; then
        dynamic_phase6_gate_prereq="$rest"; continue
      fi
      IFS='|' read -r type phase prereqs <<< "$rest"
      dyn_ids+=("$id")
      dyn_types+=("$type")
      dyn_phases+=("$phase")
      dyn_prereqs+=("$prereqs")
    done <<< "$(get_dynamic_steps "$scan_file")"
  fi

  # Add static steps in order, injecting dynamic steps at the right points
  for i in "${!static_ids[@]}"; do
    local sid="${static_ids[$i]}"
    local sprereqs="${static_prereqs[$i]}"

    # Before phase4_env_audit, insert all dynamic phase4 steps
    if [[ "$sid" == "phase4_env_audit" ]]; then
      for j in "${!dyn_ids[@]}"; do
        [[ "${dyn_phases[$j]}" == "4" ]] && _append_step "${dyn_ids[$j]}" "${dyn_types[$j]}" "${dyn_phases[$j]}" "${dyn_prereqs[$j]}"
      done
      # Fix env_audit prereqs
      [[ -n "$dynamic_env_audit_prereq" ]] && sprereqs="$dynamic_env_audit_prereq"
      _append_step "$sid" "${static_types[$i]}" "${static_phases[$i]}" "$sprereqs"
      continue
    fi

    # After phase5_run_lint, insert all dynamic phase5 test steps
    if [[ "$sid" == "phase6_gate" ]]; then
      for j in "${!dyn_ids[@]}"; do
        [[ "${dyn_phases[$j]}" == "5" ]] && _append_step "${dyn_ids[$j]}" "${dyn_types[$j]}" "${dyn_phases[$j]}" "${dyn_prereqs[$j]}"
      done
      # Fix phase6_gate prereqs
      [[ -n "$dynamic_phase6_gate_prereq" ]] && sprereqs="$dynamic_phase6_gate_prereq"
      _append_step "$sid" "${static_types[$i]}" "${static_phases[$i]}" "$sprereqs"
      continue
    fi

    _append_step "$sid" "${static_types[$i]}" "${static_phases[$i]}" "$sprereqs"
  done

  # Build JSON array
  local json_steps="["
  local first=true
  for i in "${!ordered_ids[@]}"; do
    $first || json_steps+=","
    first=false
    local idx=$((i + 1))
    json_steps+=$(jq -n \
      --arg id "${ordered_ids[$i]}" \
      --arg type "${ordered_types[$i]}" \
      --argjson phase "${ordered_phases[$i]}" \
      --arg prereqs "${ordered_prereqs[$i]}" \
      --argjson idx "$idx" \
      '{id: $id, type: $type, phase: $phase, prereqs: $prereqs, index: $idx}')
  done
  json_steps+="]"

  echo "$json_steps"
}

# Get step from ordered list by ID
get_step_by_id() {
  local step_id="$1"
  local path
  path=$(runner_state_path)
  jq -r --arg id "$step_id" '.steps[] | select(.id == $id)' "$path"
}

# Get next pending step
get_next_step() {
  local path
  path=$(runner_state_path)

  # Find current step index
  local current_step
  current_step=$(jq -r '.current_step // empty' "$path")

  if [[ -z "$current_step" ]]; then
    # Return first step
    jq -r '.steps[0].id' "$path"
    return
  fi

  # Check if current step is still in progress (fail/running)
  local current_status
  current_status=$(bash "$SCRIPT_DIR/migration-state.sh" step-status "$PROJECT_ROOT" "$current_step" 2>/dev/null || echo "unknown")

  case "$current_status" in
    pass|skip)
      # Move to next step
      local current_idx
      current_idx=$(jq -r --arg id "$current_step" '.steps[] | select(.id == $id) | .index' "$path")
      local next_id
      next_id=$(jq -r --argjson idx "$current_idx" '.steps[] | select(.index == ($idx + 1)) | .id' "$path")
      echo "$next_id"
      ;;
    fail)
      # Check retry count
      local retries max_retries
      retries=$(bash "$SCRIPT_DIR/migration-state.sh" get-retry-count "$PROJECT_ROOT" "$current_step" 2>/dev/null || echo "0")
      max_retries=$(get_max_retries "$current_step")
      if [[ "$retries" -ge "$max_retries" ]]; then
        echo "ESCALATE:$current_step"
      else
        echo "$current_step"
      fi
      ;;
    running|unknown)
      echo "$current_step"
      ;;
  esac
}

# Check if all prereqs for a step are satisfied
check_prereqs() {
  local step_id="$1"
  local path
  path=$(runner_state_path)

  local prereqs
  prereqs=$(jq -r --arg id "$step_id" '.steps[] | select(.id == $id) | .prereqs' "$path")

  [[ -n "$prereqs" ]] || return 0

  IFS=',' read -ra prereq_list <<< "$prereqs"
  for prereq in "${prereq_list[@]}"; do
    prereq=$(echo "$prereq" | xargs) # trim whitespace
    [[ -n "$prereq" ]] || continue
    local status
    status=$(bash "$SCRIPT_DIR/migration-state.sh" step-status "$PROJECT_ROOT" "$prereq" 2>/dev/null || echo "unknown")
    if [[ "$status" != "pass" ]] && [[ "$status" != "skip" ]]; then
      echo "Prerequisite '$prereq' not met (status: $status)"
      return 1
    fi
  done
  return 0
}

# ---------------------------------------------------------------------------
# Command: --init
# ---------------------------------------------------------------------------

cmd_init() {
  local project_root="${1:?Usage: runner.sh --init <project-root>}"
  PROJECT_ROOT="$(cd "$project_root" && pwd)"

  ensure_jq

  local path
  path=$(runner_state_path)

  # Initialize migration state if needed
  if [[ ! -f "${PROJECT_ROOT}/migration-state.json" ]]; then
    bash "$SCRIPT_DIR/migration-state.sh" init "$PROJECT_ROOT"
  fi

  # Build initial step list (static steps only — dynamic steps added after discovery)
  local steps
  steps=$(build_step_list)
  local total
  total=$(echo "$steps" | jq 'length')

  local now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  local state
  state=$(jq -n \
    --arg root "$PROJECT_ROOT" \
    --arg skill "$SKILL_DIR" \
    --arg t "$now" \
    --argjson steps "$steps" \
    --argjson total "$total" \
    '{
      project_root: $root,
      skill_dir: $skill,
      current_step: null,
      total_steps: $total,
      completed_steps: 0,
      initialized_at: $t,
      updated_at: $t,
      steps: $steps,
      values: {}
    }')

  atomic_write "$path" "$state"

  # Initialize runner tracking in migration state
  bash "$SCRIPT_DIR/migration-state.sh" runner-init "$PROJECT_ROOT" "$total" >/dev/null 2>&1

  echo ""
  echo "════════════════════════════════════════════════════"
  echo "MIGRATION RUNNER INITIALIZED"
  echo "════════════════════════════════════════════════════"
  echo ""
  echo "Project: $PROJECT_ROOT"
  echo "Steps: $total"
  echo "State: $path"
  echo ""
  echo "Run: bash ${SCRIPT_DIR}/runner.sh --next"
  echo ""
}

# ---------------------------------------------------------------------------
# Command: --next
# ---------------------------------------------------------------------------

cmd_next() {
  ensure_jq
  load_runner_state

  local path
  path=$(runner_state_path)
  PROJECT_ROOT=$(jq -r '.project_root' "$path")
  local total
  total=$(jq -r '.total_steps' "$path")

  # Get next step
  local next_step
  next_step=$(get_next_step)

  # Check for completion
  if [[ -z "$next_step" ]]; then
    echo ""
    echo "════════════════════════════════════════════════════"
    echo "WORKFLOW_COMPLETE"
    echo "════════════════════════════════════════════════════"
    echo ""
    echo "All $total steps completed successfully."
    echo "Run: bash ${SCRIPT_DIR}/runner.sh --status  for a summary."
    echo ""
    return 0
  fi

  # Check for escalation
  if [[ "$next_step" == ESCALATE:* ]]; then
    local failed_step="${next_step#ESCALATE:}"
    local error
    error=$(jq -r --arg s "$failed_step" '.runner.steps[$s].last_error // "Unknown error"' "${PROJECT_ROOT}/migration-state.json")
    local retries
    retries=$(bash "$SCRIPT_DIR/migration-state.sh" get-retry-count "$PROJECT_ROOT" "$failed_step" 2>/dev/null || echo "?")

    echo ""
    echo "════════════════════════════════════════════════════"
    echo "ESCALATE: ${failed_step}"
    echo "════════════════════════════════════════════════════"
    echo ""
    echo "This step has failed $retries times and needs human intervention."
    echo ""
    echo "LAST ERROR:"
    echo "$error"
    echo ""
    echo "Please fix the issue and run: bash ${SCRIPT_DIR}/runner.sh --retry"
    echo ""
    return 1
  fi

  # Rebuild dynamic steps if we just completed discovery
  local current_step
  current_step=$(jq -r '.current_step // empty' "$path")
  if [[ "$current_step" == "phase1_run_discovery" ]] && [[ -f "${PROJECT_ROOT}/twilio-scan.json" ]]; then
    rebuild_dynamic_steps
    total=$(jq -r '.total_steps' "$path")
  fi

  # Check prereqs
  local prereq_msg
  if ! prereq_msg=$(check_prereqs "$next_step"); then
    local step_info
    step_info=$(get_step_by_id "$next_step")
    local phase
    phase=$(echo "$step_info" | jq -r '.phase')
    local step_num
    step_num=$(echo "$step_info" | jq -r '.index')

    print_header "$next_step" "$step_num" "$total" "$phase"
    echo "RESULT: BLOCKED"
    echo "REASON: $prereq_msg"
    echo ""
    return 1
  fi

  # Get step metadata
  local step_info
  step_info=$(get_step_by_id "$next_step")
  local step_type phase step_num
  step_type=$(echo "$step_info" | jq -r '.type')
  phase=$(echo "$step_info" | jq -r '.phase')
  step_num=$(echo "$step_info" | jq -r '.index')

  # Get retry info
  local retries max_retries retry_info=""
  retries=$(bash "$SCRIPT_DIR/migration-state.sh" get-retry-count "$PROJECT_ROOT" "$next_step" 2>/dev/null || echo "0")
  max_retries=$(get_max_retries "$next_step")
  if [[ "$retries" -gt 0 ]]; then
    retry_info="RETRY ${retries} of ${max_retries}"
  fi

  # Record step start
  bash "$SCRIPT_DIR/migration-state.sh" step-start "$PROJECT_ROOT" "$next_step" >/dev/null 2>&1
  set_runner_value "current_step" "$next_step"

  # Execute based on type
  case "$step_type" in
    SCRIPT) execute_script_step "$next_step" "$step_num" "$total" "$phase" "$retry_info" ;;
    AGENT)  output_agent_step "$next_step" "$step_num" "$total" "$phase" "$retry_info" ;;
    GATE)   execute_gate_step "$next_step" "$step_num" "$total" "$phase" ;;
    INPUT)  output_input_step "$next_step" "$step_num" "$total" "$phase" ;;
    *)      die "Unknown step type: $step_type" ;;
  esac
}

# ---------------------------------------------------------------------------
# Step executors
# ---------------------------------------------------------------------------

execute_script_step() {
  local step_id="$1" step_num="$2" total="$3" phase="$4" retry_info="$5"

  print_header "$step_id" "$step_num" "$total" "$phase" "$retry_info"

  local cmd
  cmd=$(get_step_command "$step_id" "$PROJECT_ROOT" "$SKILL_DIR")

  if [[ -z "$cmd" ]]; then
    echo "ACTION: script"
    echo "RESULT: skip (no command defined)"
    bash "$SCRIPT_DIR/migration-state.sh" step-done "$PROJECT_ROOT" "$step_id" "skip" >/dev/null 2>&1
    return 0
  fi

  echo "ACTION: script"
  echo "RUNNING: $cmd"
  echo ""
  echo "--- output begins ---"

  local exit_code=0
  # Execute the command, passing through env vars
  eval "$cmd" 2>&1 || exit_code=$?

  echo "--- output ends ---"
  echo ""
  echo "EXIT_CODE: $exit_code"

  if [[ $exit_code -eq 0 ]]; then
    echo "RESULT: pass"
    bash "$SCRIPT_DIR/migration-state.sh" step-done "$PROJECT_ROOT" "$step_id" "pass" >/dev/null 2>&1

    # Update phase in migration state
    bash "$SCRIPT_DIR/migration-state.sh" set-phase "$PROJECT_ROOT" "$phase" >/dev/null 2>&1 || true

    local next_id
    local path
    path=$(runner_state_path)
    next_id=$(jq -r --argjson idx "$step_num" '.steps[] | select(.index == ($idx + 1)) | .id' "$path")
    if [[ -n "$next_id" ]]; then
      echo "NEXT: $next_id"
    fi
  else
    bash "$SCRIPT_DIR/migration-state.sh" increment-retry "$PROJECT_ROOT" "$step_id" >/dev/null 2>&1
    bash "$SCRIPT_DIR/migration-state.sh" step-done "$PROJECT_ROOT" "$step_id" "fail" >/dev/null 2>&1

    local retries
    retries=$(bash "$SCRIPT_DIR/migration-state.sh" get-retry-count "$PROJECT_ROOT" "$step_id" 2>/dev/null || echo "1")
    local max_retries
    max_retries=$(get_max_retries "$step_id")

    echo "RESULT: fail (attempt $retries of $max_retries)"
    echo ""
    echo "FIX_INSTRUCTION: Fix the issues listed above, then call:"
    echo "  bash ${SCRIPT_DIR}/runner.sh --next"
  fi
  echo ""
}

output_agent_step() {
  local step_id="$1" step_num="$2" total="$3" phase="$4" retry_info="$5"

  print_header "$step_id" "$step_num" "$total" "$phase" "$retry_info"

  local instruction
  instruction=$(get_step_instruction "$step_id" "$PROJECT_ROOT" "$SKILL_DIR")

  echo "ACTION: agent"
  echo "INSTRUCTION:"
  echo "$instruction"
  echo ""
  echo "WHEN_DONE: bash ${SCRIPT_DIR}/runner.sh --done ${step_id}"
  echo ""
}

execute_gate_step() {
  local step_id="$1" step_num="$2" total="$3" phase="$4"

  print_header "$step_id" "$step_num" "$total" "$phase"

  echo "ACTION: gate"

  # Gate checks are based on prereqs which we already checked
  # Additional phase-specific checks
  local blocked=false
  local reason=""

  case "$step_id" in
    phase1_gate)
      if [[ -z "${TELNYX_API_KEY:-}" ]]; then
        blocked=true
        reason="TELNYX_API_KEY is not set in the environment"
      fi
      local cost_approved
      cost_approved=$(get_runner_value "values.cost_approved" 2>/dev/null || true)
      if [[ "$cost_approved" != "true" ]]; then
        blocked=true
        reason="${reason:+$reason; }Cost not approved. Run: runner.sh --set cost_approved true"
      fi
      ;;
    phase4_gate)
      if [[ ! -f "${PROJECT_ROOT}/twilio-scan.json" ]]; then
        blocked=true
        reason="twilio-scan.json not found"
      fi
      ;;
    phase5_gate)
      # Check all phase4 products are committed
      ;;
    phase6_gate)
      # Check validation passed
      ;;
  esac

  if [[ "$blocked" == "true" ]]; then
    echo "RESULT: BLOCKED"
    echo "REASON: $reason"
    echo ""
    bash "$SCRIPT_DIR/migration-state.sh" step-done "$PROJECT_ROOT" "$step_id" "fail" >/dev/null 2>&1
    return 1
  fi

  echo "RESULT: PROCEED"
  bash "$SCRIPT_DIR/migration-state.sh" step-done "$PROJECT_ROOT" "$step_id" "pass" >/dev/null 2>&1
  bash "$SCRIPT_DIR/migration-state.sh" set-phase "$PROJECT_ROOT" "$phase" >/dev/null 2>&1 || true

  local next_id
  local path
  path=$(runner_state_path)
  next_id=$(jq -r --argjson idx "$step_num" '.steps[] | select(.index == ($idx + 1)) | .id' "$path")
  if [[ -n "$next_id" ]]; then
    echo "NEXT: $next_id"
  fi
  echo ""
}

output_input_step() {
  local step_id="$1" step_num="$2" total="$3" phase="$4"

  print_header "$step_id" "$step_num" "$total" "$phase"

  local instruction
  instruction=$(get_step_instruction "$step_id" "$PROJECT_ROOT" "$SKILL_DIR")

  echo "ACTION: input"
  echo "ASK_USER:"
  echo "$instruction"
  echo ""
  echo "AFTER COLLECTING, run these commands:"
  echo "  bash ${SCRIPT_DIR}/runner.sh --set TELNYX_API_KEY <key>"
  echo "  bash ${SCRIPT_DIR}/runner.sh --set TELNYX_TO_NUMBER <number>"
  echo "  bash ${SCRIPT_DIR}/runner.sh --set cost_approved true"
  echo "  export TELNYX_API_KEY=<key>"
  echo "  export TELNYX_TO_NUMBER=<number>"
  echo ""
  echo "Then: bash ${SCRIPT_DIR}/runner.sh --next"
  echo ""
}

# ---------------------------------------------------------------------------
# Command: --done
# ---------------------------------------------------------------------------

cmd_done() {
  local step_id="${1:?Usage: runner.sh --done <step-id>}"

  ensure_jq
  load_runner_state

  local path
  path=$(runner_state_path)
  PROJECT_ROOT=$(jq -r '.project_root' "$path")

  # Run validation if defined
  local validation_cmd
  validation_cmd=$(get_step_validation "$step_id" "$PROJECT_ROOT" "$SKILL_DIR")

  if [[ -n "$validation_cmd" ]]; then
    echo "Validating step $step_id..."
    echo "RUNNING: $validation_cmd"
    echo ""

    local exit_code=0
    eval "$validation_cmd" 2>&1 || exit_code=$?

    if [[ $exit_code -ne 0 ]]; then
      echo ""
      echo "VALIDATION FAILED (exit code: $exit_code)"
      echo "Fix the issues and run: bash ${SCRIPT_DIR}/runner.sh --done ${step_id}"
      bash "$SCRIPT_DIR/migration-state.sh" increment-retry "$PROJECT_ROOT" "$step_id" >/dev/null 2>&1
      bash "$SCRIPT_DIR/migration-state.sh" step-done "$PROJECT_ROOT" "$step_id" "fail" >/dev/null 2>&1
      return 1
    fi
  fi

  # Mark as done
  bash "$SCRIPT_DIR/migration-state.sh" step-done "$PROJECT_ROOT" "$step_id" "pass" >/dev/null 2>&1

  # Update completed count
  local completed
  completed=$(jq '.steps | map(select(.id as $id | false)) | length' "$path" 2>/dev/null || echo "0")

  local step_info
  step_info=$(get_step_by_id "$step_id")
  local phase
  phase=$(echo "$step_info" | jq -r '.phase')
  bash "$SCRIPT_DIR/migration-state.sh" set-phase "$PROJECT_ROOT" "$phase" >/dev/null 2>&1 || true

  echo ""
  echo "Step $step_id: DONE"
  echo ""
  echo "Run: bash ${SCRIPT_DIR}/runner.sh --next"
  echo ""
}

# ---------------------------------------------------------------------------
# Command: --set
# ---------------------------------------------------------------------------

cmd_set() {
  local key="${1:?Usage: runner.sh --set <key> <value>}"
  local value="${2:?}"

  ensure_jq
  load_runner_state

  local path
  path=$(runner_state_path)
  PROJECT_ROOT=$(jq -r '.project_root' "$path")

  # Store in runner state
  set_runner_value "values.${key}" "$value"

  # Also set in migration state if it's a known migration key
  case "$key" in
    TELNYX_API_KEY|TELNYX_TO_NUMBER|cost_approved)
      bash "$SCRIPT_DIR/migration-state.sh" set "$PROJECT_ROOT" "$key" "$value" >/dev/null 2>&1 || true
      ;;
  esac

  # Check if all INPUT step requirements are met
  local api_key to_number cost_approved
  api_key=$(get_runner_value "values.TELNYX_API_KEY" 2>/dev/null || true)
  to_number=$(get_runner_value "values.TELNYX_TO_NUMBER" 2>/dev/null || true)
  cost_approved=$(get_runner_value "values.cost_approved" 2>/dev/null || true)

  if [[ -n "$api_key" ]] && [[ -n "$to_number" ]] && [[ "$cost_approved" == "true" ]]; then
    # Mark input step as complete
    bash "$SCRIPT_DIR/migration-state.sh" step-done "$PROJECT_ROOT" "phase0_collect_input" "pass" >/dev/null 2>&1
    echo "Set $key. All prerequisites collected."
    echo ""
    echo "Run: bash ${SCRIPT_DIR}/runner.sh --next"
  else
    echo "Set $key."
    local missing=""
    [[ -n "$api_key" ]] || missing="${missing} TELNYX_API_KEY"
    [[ -n "$to_number" ]] || missing="${missing} TELNYX_TO_NUMBER"
    [[ "$cost_approved" == "true" ]] || missing="${missing} cost_approved"
    echo "Still needed:${missing}"
  fi
  echo ""
}

# ---------------------------------------------------------------------------
# Command: --status
# ---------------------------------------------------------------------------

cmd_status() {
  ensure_jq
  load_runner_state

  local path
  path=$(runner_state_path)
  PROJECT_ROOT=$(jq -r '.project_root' "$path")

  local total current_step
  total=$(jq -r '.total_steps' "$path")
  current_step=$(jq -r '.current_step // "none"' "$path")

  # Count completed steps from migration state
  local completed=0
  local migration_state="${PROJECT_ROOT}/migration-state.json"
  if [[ -f "$migration_state" ]]; then
    completed=$(jq '[.runner.steps // {} | to_entries[] | select(.value.status == "pass" or .value.status == "skip")] | length' "$migration_state" 2>/dev/null || echo "0")
  fi

  local current_phase
  current_phase=$(jq -r '.runner.steps // {} | to_entries | map(select(.value.status == "pass" or .value.status == "skip")) | last // {key: "none"} | .key' "$migration_state" 2>/dev/null || echo "?")

  echo ""
  echo "════════════════════════════════════════════════════"
  echo "MIGRATION RUNNER STATUS"
  echo "════════════════════════════════════════════════════"
  echo ""
  echo "Project:       $PROJECT_ROOT"
  echo "Current step:  $current_step"
  echo "Progress:      $completed / $total steps"
  echo ""

  # Show per-phase summary
  echo "Phase Summary:"
  for p in 0 1 2 3 4 5 6; do
    local phase_name
    phase_name=$(get_phase_name "$p")
    local phase_steps phase_done
    phase_steps=$(jq --argjson p "$p" '[.steps[] | select(.phase == $p)] | length' "$path")
    phase_done=0
    if [[ -f "$migration_state" ]]; then
      # Count steps for this phase that are done
      for sid in $(jq -r --argjson p "$p" '.steps[] | select(.phase == $p) | .id' "$path"); do
        local s_status
        s_status=$(jq -r --arg s "$sid" '.runner.steps[$s].status // "pending"' "$migration_state" 2>/dev/null || echo "pending")
        if [[ "$s_status" == "pass" ]] || [[ "$s_status" == "skip" ]]; then
          phase_done=$((phase_done + 1))
        fi
      done
    fi
    local indicator="  "
    [[ $phase_done -eq $phase_steps ]] && [[ $phase_steps -gt 0 ]] && indicator="✓ "
    [[ $phase_done -gt 0 ]] && [[ $phase_done -lt $phase_steps ]] && indicator="→ "
    printf "  %s Phase %d: %-15s %d/%d\n" "$indicator" "$p" "$phase_name" "$phase_done" "$phase_steps"
  done
  echo ""
}

# ---------------------------------------------------------------------------
# Command: --retry
# ---------------------------------------------------------------------------

cmd_retry() {
  ensure_jq
  load_runner_state

  local path
  path=$(runner_state_path)
  PROJECT_ROOT=$(jq -r '.project_root' "$path")

  local current_step
  current_step=$(jq -r '.current_step // empty' "$path")

  if [[ -z "$current_step" ]]; then
    echo "No current step to retry."
    return 1
  fi

  # Reset the step status so --next will re-execute it
  bash "$SCRIPT_DIR/migration-state.sh" step-start "$PROJECT_ROOT" "$current_step" >/dev/null 2>&1

  echo "Reset step $current_step for retry."
  echo "Run: bash ${SCRIPT_DIR}/runner.sh --next"
  echo ""
}

# ---------------------------------------------------------------------------
# Rebuild dynamic steps after discovery
# ---------------------------------------------------------------------------

rebuild_dynamic_steps() {
  local path
  path=$(runner_state_path)

  local steps
  steps=$(build_step_list)
  local total
  total=$(echo "$steps" | jq 'length')

  # Update runner state with new step list
  local tmp
  tmp=$(jq --argjson steps "$steps" --argjson total "$total" \
    '.steps = $steps | .total_steps = $total' "$path")
  atomic_write "$path" "$tmp"

  # Update migration state total
  bash "$SCRIPT_DIR/migration-state.sh" set-total-steps "$PROJECT_ROOT" "$total" >/dev/null 2>&1 || true

  echo "  (rebuilt step list: $total steps based on discovery results)"
}

# ---------------------------------------------------------------------------
# Find project root from runner state file
# ---------------------------------------------------------------------------

find_project_root() {
  if [[ -f "./${RUNNER_STATE_FILE}" ]]; then
    PROJECT_ROOT="$(pwd)"
    return 0
  fi
  local dir
  dir="$(pwd)"
  while [[ "$dir" != "/" ]]; do
    if [[ -f "${dir}/${RUNNER_STATE_FILE}" ]]; then
      PROJECT_ROOT="$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  die "No runner state found. Run: runner.sh --init <project-root>"
}

# ---------------------------------------------------------------------------
# Main dispatch
# ---------------------------------------------------------------------------

case "${1:-}" in
  --init)
    shift
    cmd_init "$@"
    ;;
  --next)
    find_project_root
    cmd_next
    ;;
  --done)
    shift
    find_project_root
    cmd_done "$@"
    ;;
  --set)
    shift
    find_project_root
    cmd_set "$@"
    ;;
  --status)
    find_project_root
    cmd_status
    ;;
  --retry)
    find_project_root
    cmd_retry
    ;;
  *)
    echo "Usage: runner.sh <command> [args]"
    echo ""
    echo "Commands:"
    echo "  --init <project-root>   Initialize workflow state"
    echo "  --next                  Execute or output the next step"
    echo "  --done <step-id>        Mark an AGENT step as complete"
    echo "  --set <key> <value>     Set a value (for INPUT steps)"
    echo "  --status                Show current position and progress"
    echo "  --retry                 Re-run the current failed step"
    exit 1
    ;;
esac
