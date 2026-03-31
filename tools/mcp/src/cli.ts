#!/usr/bin/env node

import { createProxy } from "./index.js";

function getApiKey(): string {
  const args = process.argv.slice(2);

  // Check --api-key flag
  const keyFlagIndex = args.indexOf("--api-key");
  if (keyFlagIndex !== -1 && args[keyFlagIndex + 1]) {
    return args[keyFlagIndex + 1];
  }

  // Check environment variable
  if (process.env.TELNYX_API_KEY) {
    return process.env.TELNYX_API_KEY;
  }

  console.error(
    "Error: Telnyx API key required. Provide via --api-key flag or TELNYX_API_KEY environment variable."
  );
  process.exit(1);
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`Usage: telnyx-mcp [options]

Options:
  --api-key <key>  Telnyx API key (or set TELNYX_API_KEY env var)
  --help, -h       Show this help message

Proxies MCP requests from your IDE to the remote Telnyx MCP server
at https://api.telnyx.com/v2/mcp`);
    process.exit(0);
  }

  const apiKey = getApiKey();
  await createProxy({ apiKey });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
