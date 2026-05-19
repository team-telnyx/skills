# @telnyx/mcp

The Telnyx [Model Context Protocol](https://modelcontextprotocol.com/) server allows you to integrate with Telnyx APIs through function calling. This protocol supports various tools to interact with different Telnyx services.

## Setup

To run the Telnyx MCP server locally using npx:

```bash
npx -y @telnyx/mcp --api-key=YOUR_TELNYX_API_KEY
```

Or set the environment variable:

```bash
export TELNYX_API_KEY=YOUR_KEY
npx -y @telnyx/mcp
```

## How it works

The shim resolves an MCP endpoint URL and proxies messages stdio ↔ Streamable HTTP between your MCP client and the resolved endpoint.

Resolution order:
1. `TELNYX_MCP_URL` override, if set
2. Cached per-tenant URL from a prior successful provision (`~/.telnyx/mcp-endpoint.json`)
3. Fresh provision on Telnyx Edge Compute (opt-in — see below)
4. Shared hosted endpoint at `https://api.telnyx.com/v2/mcp` (fallback)

## Opting in to an isolated per-account endpoint

By default the shim uses the shared hosted endpoint. To get a dedicated, Firecracker-isolated MCP server provisioned for your account:

```bash
export TELNYX_MCP_ACCEPT_FULL_SCOPE=1
npx -y @telnyx/mcp
```

**⚠️ Security note.** With opt-in enabled, the shim creates a Telnyx Edge Compute secret holding your **raw, full-scope** Telnyx API key and deploys an MCP func that reads it at runtime. Firecracker isolates each customer's func from every other customer's — but inside the func, a compromise (e.g., prompt-injected agent code running under Deno `eval`) would see the raw API key. That key has full access to your Telnyx account: buying numbers, spending balance, reading recordings, etc.

Only opt in if you understand and accept this trade. A future release will swap the raw API key for a scoped, short-lived credential — see the deployment strategy doc for context.

### Inbound auth: `SHARED_SECRET`

The deployed func enforces bearer-token auth on inbound MCP requests using a `SHARED_SECRET` distinct from your Telnyx API key. The deploy API generates one server-side and returns it once; the shim caches the value at `~/.telnyx/mcp-endpoint.json` (mode 0600) and uses it as the bearer for every MCP message it proxies. If the cache is lost, the value cannot be recovered (Telnyx secrets list returns names only) — run `--reset` to provision a fresh secret.

## Flags and environment

| Flag / env | Description |
|---|---|
| `--api-key <key>` / `TELNYX_API_KEY` | Telnyx API key. Required. |
| `TELNYX_MCP_ACCEPT_FULL_SCOPE` | Set to `1` to opt in to per-account provisioning. Required; see security note above. |
| `--reset` / `TELNYX_MCP_RESET=1` | Discard cached endpoint and re-provision on this run. |
| `TELNYX_MCP_URL` | Override the resolved endpoint with an explicit URL (advanced). Skips provisioning and cache entirely. |
