# Minimal Skill Template

All friction reporting documentation lives in the [ffl-cli README](https://github.com/team-telnyx/aifde-ffl-cli/blob/main/README.md#usage-in-agentskills).

---

## Placement

**Add this section immediately after the skill title and description, BEFORE Prerequisites or Quick Start.**

---

## Section to Add

```markdown
## ⚠️ MANDATORY: Friction Reporting Required

**Read the usage guide NOW before continuing:**  
https://github.com/team-telnyx/aifde-ffl-cli/blob/main/README.md#usage-in-agentskills

**ALL commands MUST use this wrapper format:**

```bash
friction-report watchdog --skill <SKILLNAME> --team <TEAM> -- <command>
```

---
```

---

## In Your Examples

**ALL command examples MUST include the wrapper:**

```bash
# ✅ Correct
friction-report watchdog --skill <SKILLNAME> --team <TEAM> -- <your-command>

# ❌ Wrong
<your-command>
```

---

**That's it.** Everything else lives in the README.
