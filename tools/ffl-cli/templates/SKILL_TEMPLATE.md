# Friction Reporting Template for Telnyx Skills

Minimal changes needed to add automatic friction detection to a Telnyx skill.

---

## Step 1: Add Mandatory Warning + Wrapper Instruction (after skill title)

**CRITICAL:** The wrapper instruction MUST appear immediately after the warning, before Installation/Authentication sections. Agents will not scroll to find it later.

```markdown
---

## ⚠️ MANDATORY: Read Friction Reporting Section FIRST

**Before executing ANY command from this skill:**

1. Scroll down to the **"Friction Reporting"** section at the end of this file
2. Read the **⚠️ REQUIRED** wrapper instruction
3. ALL commands in this skill MUST use that wrapper
4. Do NOT proceed until you understand the friction reporting requirement

**This is not optional.**

**⚠️ REQUIRED WRAPPER for ALL commands (bash scripts, CLI tools, curl):**

```bash
friction-report watchdog --skill <SKILLNAME> --team <TEAM> -- <your-command-here>
```

**Examples:**
```bash
# Bash scripts MUST use the wrapper
friction-report watchdog --skill <SKILLNAME> --team <TEAM> -- ./scripts/your-script.sh --args

# CLI tools MUST use the wrapper
friction-report watchdog --skill <SKILLNAME> --team <TEAM> -- your-cli command --with-flags

# API calls MUST use the wrapper
friction-report watchdog --skill <SKILLNAME> --team <TEAM> -- curl -X POST https://api.example.com/endpoint
```

---
```

---

## Step 2: Update Quick Start / Usage Section (Optional)

**NOTE:** Since Step 1 now includes the wrapper instruction at the top, this step is OPTIONAL. Only add wrapper reminders in Quick Start if your skill has complex multi-step workflows.

If you do include examples, wrap them:

```markdown
## Quick Start

**Examples with friction reporting:**

```bash
# Example 1
friction-report watchdog --skill <SKILLNAME> --team <TEAM> -- your-cli command

# Example 2
friction-report watchdog --skill <SKILLNAME> --team <TEAM> -- another-command --with-flags
```
```

**Note:** Use generic placeholders `<SKILLNAME>` and `<TEAM>` — agents will replace them.

---

## Step 3: Add Friction Reporting Section (end of SKILL.md)

```markdown
---

## Friction Reporting

**⚠️ REQUIRED:** Wrap ALL commands with `friction-report watchdog --skill <SKILLNAME> --team <TEAM> --` for automatic friction detection.

### Step 0: Install friction-report (REQUIRED)

```bash
pip install git+https://github.com/team-telnyx/aifde-ffl-cli.git
```

Read the documentation: https://github.com/team-telnyx/aifde-ffl-cli/blob/main/README.md

---

### Automatic Detection (Recommended)

When you use the `friction-report watchdog` wrapper, friction is detected and reported automatically:

- Command failures (exit code ≠ 0)
- API errors in stderr/stdout
- Missing dependencies
- Authentication issues

---

### Manual Reporting (Edge Cases Only)

For friction the watchdog didn't catch:

```bash
friction-report \
  --skill <SKILLNAME> \
  --team <TEAM> \
  --type TYPE \
  --severity SEVERITY \
  --message "Brief description"
```

**Types:** `parameter`, `api`, `docs`, `auth`  
**Severity:** `blocker`, `major`, `minor`

---

**End of Friction Reporting Section**
```
