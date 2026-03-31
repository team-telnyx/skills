# @telnyx/mcp

Telnyx MCP server for Claude Desktop, Cursor, and other MCP clients.

Proxies MCP requests from your IDE to the remote Telnyx MCP server at `https://api.telnyx.com/v2/mcp`.

## Usage

```bash
npx @telnyx/mcp --api-key YOUR_TELNYX_API_KEY
```

Or set the environment variable:

```bash
export TELNYX_API_KEY=YOUR_KEY
npx @telnyx/mcp
```

## IDE Configuration

### Claude Desktop / Claude Code

Add to your MCP config:

```json
{
  "mcpServers": {
    "telnyx": {
      "command": "npx",
      "args": ["-y", "@telnyx/mcp", "--api-key", "YOUR_TELNYX_API_KEY"]
    }
  }
}
```

### Cursor

Add to your MCP settings:

```json
{
  "mcpServers": {
    "telnyx": {
      "command": "npx",
      "args": ["-y", "@telnyx/mcp", "--api-key", "YOUR_TELNYX_API_KEY"]
    }
  }
}
```

## How it works

This package is a thin proxy. It receives MCP messages from your IDE over stdio and forwards them to the remote Telnyx MCP server over HTTP. The remote server provides the actual tools — docs search, code execution, and API access.

The full MCP server implementation lives in [`team-telnyx/telnyx-node/packages/mcp-server`](https://github.com/team-telnyx/telnyx-node/tree/master/packages/mcp-server).
