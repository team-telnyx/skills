# opencode-telnyx-auth

OpenCode plugin that adds Telnyx as a provider, supports `opencode auth login`, auto-registers supported Telnyx-hosted chat models, provides an interactive `/telnyx` model manager, and works around Telnyx's `max_completion_tokens` + tools incompatibility.

## What it does

- registers a `telnyx` provider via `@ai-sdk/openai-compatible`
- adds `telnyx` to `opencode auth login`
- reads the Telnyx API key from either:
  - `TELNYX_API_KEY`
  - `~/.local/share/opencode/auth.json` via `opencode auth login`
- fetches available models from `https://api.telnyx.com/v2/ai/models` at startup
- only registers Telnyx-hosted text models from the model list (`owned_by: "Telnyx"`)
- enables only the 3 recommended models by default:
  - `moonshotai/Kimi-K2.6`
  - `zai-org/GLM-5.1-FP8`
  - `MiniMaxAI/MiniMax-M2.7`
- lets users enable additional Telnyx-hosted models later through the `/telnyx` TUI command
- persists the enabled Telnyx model allowlist in `~/.config/opencode/telnyx-models.json`
- excludes passthrough models that require external provider credentials such as OpenAI, Anthropic, Google, xAI, and Groq
- strips `maxOutputTokens` before requests so Telnyx accepts tool-enabled runs

## Setup

1. Clone this repo somewhere local.
2. Install dependencies and build it:

   ```bash
   bun install
   bun run build
   ```

3. Add the plugin to your `~/.config/opencode/opencode.json`:

   ```json
   {
     "plugin": [
       "file:///absolute/path/to/opencode-telnyx-auth"
     ]
   }
   ```

4. If you want the interactive Telnyx model manager in the TUI, also add the plugin to `~/.config/opencode/tui.json`:

   ```json
   {
     "$schema": "https://opencode.ai/tui.json",
     "plugin": [
       "file:///absolute/path/to/opencode-telnyx-auth"
     ]
   }
   ```

5. Log in with your Telnyx API key:

   ```bash
   opencode auth login --provider telnyx --method "API Key"
   ```

   During login the plugin also asks which Telnyx model preset to enable:

   - **Recommended 3 (default)**
   - **All hosted Telnyx models**
   - **Keep existing config**

   Or set an env var instead:

   ```bash
   export TELNYX_API_KEY="YOUR_KEY"
   ```

6. Verify the credential is present:

   ```bash
   opencode auth list
   ```

7. Run a model:

   ```bash
   opencode run --model 'telnyx/moonshotai/Kimi-K2.6' 'Say hello in one sentence.'
   ```

## How auth works

Auth precedence is:

1. `TELNYX_API_KEY`
2. stored `telnyx` API credential in `~/.local/share/opencode/auth.json`

`opencode auth login` stores the key in OpenCode's normal auth store, so this behaves like a native provider instead of relying on hardcoded config.

## Model registration

At startup the plugin calls:

- `GET https://api.telnyx.com/v2/ai/models`

It still fetches the full Telnyx model list from the API, but it only registers Telnyx-hosted text generation models whose IDs are present in the persisted allowlist file.

Default allowlist:

- `moonshotai/Kimi-K2.6`
- `zai-org/GLM-5.1-FP8`
- `MiniMaxAI/MiniMax-M2.7`

Allowlist file:

```json
{
  "version": 1,
  "enabledModels": [
    "moonshotai/Kimi-K2.6",
    "zai-org/GLM-5.1-FP8",
    "MiniMaxAI/MiniMax-M2.7"
  ]
}
```

Path:

- `~/.config/opencode/telnyx-models.json`
- override with `OPENCODE_TELNYX_MODELS_PATH`

The plugin ships with only the 3 recommended models enabled by default. Users can enable more Telnyx-hosted models later using the `/telnyx` command in the OpenCode TUI, by editing the allowlist file directly, or by re-running `opencode auth login --provider telnyx --method "API Key"`.

## TUI model manager

If the plugin is also loaded in `tui.json`, it registers a `/telnyx` command (alias: `/telnyx-models`) that opens an interactive model manager.

- the dialog starts from the default 3-model allowlist
- selecting a model toggles it on or off
- changes are persisted to `~/.config/opencode/telnyx-models.json`
- updated provider model availability is applied without manually editing config files

This command manages which Telnyx-hosted models are available under the `telnyx` provider. It does not change OpenCode core model-selection behavior outside this plugin.

This plugin does **not** currently create or manage Telnyx `api_key_ref` integration secrets for external providers such as Groq, OpenAI, Anthropic, Google, or xAI.

## Why the plugin exists

Telnyx rejects requests that include both:

- function tools
- `max_completion_tokens` / `max_tokens`

OpenCode normally sends tools and an output token cap together. The plugin fixes that by unsetting `maxOutputTokens` for the `telnyx` provider before the SDK builds the request.

## Build

```bash
bun run build
bun run typecheck
```

## Quick start for contributors

```bash
bun install
bun run typecheck
bun run build
```

## Testing all Telnyx models

The repo includes a live regression harness that:

- fetches the current Telnyx model list from `https://api.telnyx.com/v2/ai/models`
- applies the same text-model + Telnyx-hosted filtering as the plugin
- runs a simple prompt against every model
- runs a tool-calling prompt against every model using OpenCode's `read` tool
- reports excluded external-key models separately so you can see which Telnyx-listed models are passthrough-only

Create a `.env` file in the repo root with:

```bash
TELNYX_API_KEY=your_telnyx_key
```

Then run:

```bash
make test
```

This builds the plugin first, then runs the live checks through `opencode run` so the plugin path under test is the one actually exercised.

Useful optional filters:

```bash
TELNYX_TEST_MODEL_MATCH=Llama-3.3-70B-Instruct make test
TELNYX_TEST_LIMIT=1 make test
TELNYX_TEST_AGENT=sisyphus make test
TELNYX_TEST_VARIANT=max make test
TELNYX_TEST_INCLUDE_EXTERNAL=1 make test
```

Artifacts are written to `test/.artifacts/`, including raw per-model outputs and a `results.json` summary.
External-provider models are reported separately and, if included explicitly, marked as skipped because the plugin intentionally does not register them without provider-specific key support.

## Troubleshooting

### `Unknown provider "telnyx"`

The plugin is not loaded. Check the `file:///...` path in `opencode.json` and rebuild the plugin.

### No Telnyx models show up

The API key is missing or invalid. Run:

```bash
opencode auth list
```

or set `TELNYX_API_KEY` and retry.

### A small-context model fails while larger models work

Some smaller models cannot fit OpenCode's full tool list and system prompt into their effective prompt budget. This is model-specific, not a plugin auth issue.

### `/telnyx` does not appear

Make sure the plugin is listed in `~/.config/opencode/tui.json`, not only in `opencode.json`.

<details>
<summary>Agent notes (humans can ignore)</summary>

- local build/install commands assume `bun` is installed
- package manager is `bun`; use `bun install`, `bun run build`, and `bun run typecheck`
- runtime dependency is `@opencode-ai/plugin`
- local build-time dependencies are `typescript` and `@types/node`
- OpenCode loads the built plugin from `dist/`, so cloning the repo alone is not enough; it must be built first
- a valid Telnyx API key is required either via `TELNYX_API_KEY` or `opencode auth login`
- provider id is `telnyx`
- auth hook method is `API Key`
- auth precedence is env first, then stored auth.json key
- model list is dynamic; do not hardcode model ids in downstream automation
- Telnyx model availability is gated by the allowlist in `~/.config/opencode/telnyx-models.json`
- default enabled models are `moonshotai/Kimi-K2.6`, `zai-org/GLM-5.1-FP8`, and `MiniMaxAI/MiniMax-M2.7`
- `/telnyx` in the TUI allows users to opt into more hosted models
- the Telnyx compatibility fix is in the `chat.params` hook and only unsets `maxOutputTokens`

</details>
