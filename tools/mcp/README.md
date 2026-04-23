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

On first run, the shim provisions an isolated MCP endpoint on Telnyx Edge Compute for your account and caches the URL at `~/.telnyx/mcp-endpoint.json`. Subsequent runs reuse the cached endpoint. If per-tenant provisioning is unavailable, the shim falls back to the shared hosted endpoint at `https://api.telnyx.com/v2/mcp` so connections keep working.

Messages flow stdio ↔ Streamable HTTP between your MCP client and the resolved endpoint.

## Flags and environment

| Flag / env | Description |
|---|---|
| `--api-key <key>` / `TELNYX_API_KEY` | Telnyx API key. Required. |
| `--reset` / `TELNYX_MCP_RESET=1` | Discard cached endpoint and re-provision on this run. |
| `TELNYX_MCP_URL` | Override the resolved endpoint with an explicit URL (advanced). Skips provisioning and cache entirely. |
