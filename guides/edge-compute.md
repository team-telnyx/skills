# Edge Compute

Use Telnyx Edge Compute when your AI workflow needs low-latency code execution, webhook handling, or an MCP/webhook endpoint that runs on Telnyx edge infrastructure.

## Important scope boundary

`team-telnyx/ai` does **not** manage Edge Compute lifecycle directly.

This repo helps you discover where Edge Compute fits into an AI workflow, but the actual function lifecycle is owned by:

- the `team-telnyx/edge-compute` repo
- the `telnyx-edge` CLI

That means:
- build/deploy/delete/secrets/bindings live in `telnyx-edge`
- agent/orchestration logic can live in `team-telnyx/ai`
- `team-telnyx/ai` should not pretend to replace Edge Compute

A useful mental model:
- **`ai` = brain / orchestration layer**
- **Edge Compute = low-latency hands / execution layer**

## When to use Edge Compute with `ai`

Good bridge use cases:

1. **MCP server adapters at the edge**
   - expose AI-adjacent tools close to the runtime
2. **Webhook ingestion + AI routing**
   - receive webhook traffic, normalize it, then hand off to AI logic
3. **AI-adjacent functions**
   - redaction, enrichment, scoring, post-processing, lightweight transforms

## Prerequisite: install `telnyx-edge`

Edge Compute is managed through the separate CLI:

```sh
# See the edge-compute repo for install/setup details
# https://github.com/team-telnyx/edge-compute

telnyx-edge auth login
telnyx-edge status
```

Typical lifecycle commands live there:

```sh
telnyx-edge new-func
telnyx-edge ship
telnyx-edge list
telnyx-edge delete-func
telnyx-edge secrets
telnyx-edge bindings
```

## Reference architecture

A practical pattern looks like this:

1. Use `team-telnyx/ai` for:
   - agent workflows
   - prompts/orchestration
   - guides and capability discovery
   - Telnyx API integrations
2. Use `team-telnyx/edge-compute` for:
   - function scaffolding
   - deployment
   - secrets and bindings
   - running webhook/MCP edge endpoints
3. Connect them with a stable boundary:
   - HTTP webhook
   - MCP endpoint
   - function call into an edge-hosted adapter

## Endgame: what a good integration looks like

The end state is **not** "move Edge Compute into `team-telnyx/ai`".

The better endgame is a clear two-layer product:

### Layer 1 — `team-telnyx/ai`
This layer should:
- expose Edge Compute as a first-class capability in docs/manifests/help output
- provide AI-oriented patterns and recipes
- explain when an agent should reach for edge execution
- help users connect agent workflows to deployed edge endpoints

### Layer 2 — `team-telnyx/edge-compute`
This layer should continue to own:
- auth
- function creation
- deployment
- secrets
- bindings
- runtime lifecycle and operational ergonomics

### Bridge between them
The bridge should be explicit and boring:
- `ai` produces orchestration guidance
- Edge Compute provides execution endpoints
- the contract between them is HTTP, MCP, or a documented function interface

That keeps ownership clear and avoids duplicating deployment tooling.

## Phased rollout

### Phase 1 — Discoverability (this repo, now)
- add Edge Compute capability visibility
- add guide-level handoff and examples
- make the README and capabilities output honest about scope

### Phase 2 — Guided integration
- add richer examples for webhook handlers, MCP adapters, and AI post-processing functions
- add copy-paste scaffolds for how an AI app should call a deployed edge endpoint
- document required secrets/bindings patterns

### Phase 3 — CLI bridge
Only if ownership stays clear:
- lightweight helper commands or docs-driven handoff from `telnyx-agent` to `telnyx-edge`
- examples: `edge doctor`, `setup-edge-mcp`, or explicit "next command" guidance
- these should shell out to `telnyx-edge`, not reimplement lifecycle management

### Phase 4 — Deeper integration (optional, later)
Only if a stable contract exists:
- standardized templates
- stronger config generation
- possibly a shared library or interface contract

Not before.

## Example: AI app calling an Edge endpoint

A simple pattern is to let your AI app call a deployed edge function for specialized execution.

```ts
const response = await fetch("https://<your-edge-endpoint>", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
  },
  body: JSON.stringify({
    task: "redact_pii",
    payload: {
      text: "Call me at +1 555 123 4567",
    },
  }),
});

const result = await response.json();
console.log(result);
```

## Example patterns worth supporting

### 1. MCP server at the edge
Use Edge Compute to host a narrow MCP adapter close to runtime, while `team-telnyx/ai` handles the surrounding agent experience and capability discovery.

### 2. Webhook receiver + AI router
Use Edge Compute to receive inbound webhooks, normalize payloads, and forward structured requests into AI workflows.

### 3. Post-processing function
Use Edge Compute for deterministic transforms such as:
- redaction
- enrichment
- scoring
- transcript cleanup
- lightweight policy checks

These are the sweet spot: small execution units attached to larger agent workflows.

## What this repo should and should not claim

This repo **can**:
- explain how Edge Compute fits into AI-agent workflows
- provide examples and bridge guidance
- point users to the right product surface

This repo **should not** claim that it:
- deploys edge functions directly
- manages rollbacks or lifecycle state
- replaces `telnyx-edge`
- provides complete native Edge Compute support

## Best next step

If you want to use Edge Compute from an AI workflow today:

1. install and authenticate `telnyx-edge`
2. create/deploy your function in `team-telnyx/edge-compute`
3. expose a stable HTTP or MCP boundary
4. use `team-telnyx/ai` to orchestrate calls into that deployed endpoint

For deploy/runtime specifics, use the `edge-compute` repo as the source of truth.

## Source of truth

- AI workflow/orchestration guidance: `team-telnyx/ai`
- Edge lifecycle and deployment: `team-telnyx/edge-compute`
- Runtime deploy tool: `telnyx-edge`
