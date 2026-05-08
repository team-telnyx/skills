# Windsurf rules — team-telnyx/ai

Operating rules for the Windsurf agent (Cascade) working in this repo.
The canonical source of truth is `AGENTS.md` at the repo root — keep
this file in sync.

## Hard rules (must follow)

- **Generated files** under `providers/{claude,cursor}/plugin/skills/`
  are produced by `./scripts/sync-skills.sh` from `skills/`. Never
  hand-edit. Edit the source under `skills/` and run the sync script.
- **Per-package installs**: each package owns its own `package.json` /
  `node_modules`. Don't run `npm install` at the repo root and don't
  introduce a root-level test runner.
- **No secrets in commits**: no `.env`, no API keys, no credentials.
  Use existing `.env.example` patterns.
- **Conventional Commits** title prefix (`feat:`, `fix:`, `chore:`,
  `docs:`). Commits must be signed.

## Setup

Per package, not root:

```bash
cd cli && npm ci
cd tools/typescript && npm ci
cd tools/mcp && npm ci
cd tools/python && pip install -e ".[dev]"
```

## Testing

Run only the package you touched.

| Package | Command |
| --- | --- |
| `cli/` | `cd cli && npm test` |
| `tools/python/` | `cd tools/python && pytest` |
| `tools/typescript/` | `cd tools/typescript && npm test` |
| `tools/mcp/` | `cd tools/mcp && npm run build` |
| `guides/` | `npm run test:guides` (root) |

## Skills workflow

Skills live as `SKILL.md` under `skills/<name>/`. After any edit, run
`./scripts/sync-skills.sh` and commit the output alongside the source.

## Code style

- TypeScript ES2020+, strict, ESM where supported
- Python 3.10+, PEP 8, type hints on public functions
- Markdown: GFM with ATX headings
- One concern per PR

For runtime-agent (consumer) guidance, see `AGENTS.md` §"Consuming this
repo as a runtime agent".
