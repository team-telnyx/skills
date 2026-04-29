# Plugins

Coding-assistant plugins that wire Telnyx into AI IDEs and CLIs.

## Current contents

- **`opencode/`** — OpenCode plugin, published as [`@telnyx/opencode`](https://www.npmjs.com/package/@telnyx/opencode). Adds Telnyx as a model provider with auth handling and a TUI for managing hosted models. Absorbed from the now-archived `team-telnyx/opencode-telnyx-auth` repo.

## Coming next

The Claude Code and Cursor plugin payloads currently live at `providers/claude/plugin/` and `providers/cursor/plugin/` and will move to `plugins/claude-code/` and `plugins/cursor/` in a follow-up step. The root `.claude-plugin/marketplace.json` and `.cursor-plugin/marketplace.json` files stay at the repo root (they're consumed by `/plugin marketplace add team-telnyx/ai` and the Cursor marketplace) — only their `source:` fields will be rewired.

Gemini CLI has no payload directory: its entire integration is the root `gemini-extension.json`, consumed by `gemini extensions install https://github.com/team-telnyx/ai`.

See the repo root `README.md` for install instructions and the broader architecture.
