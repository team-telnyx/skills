#!/usr/bin/env node

import { createProxy } from "./index.js";
import { resolveEndpoint } from "./endpoint.js";

function getApiKey(): string {
  const args = process.argv.slice(2);

  // Check --api-key=VALUE (equals-separated)
  const equalsArg = args.find((a) => a.startsWith("--api-key="));
  if (equalsArg) {
    return equalsArg.split("=").slice(1).join("=");
  }

  // Check --api-key VALUE (space-separated)
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
  --reset          Discard cached endpoint and re-provision on this run
  --help, -h       Show this help message

Environment:
  TELNYX_API_KEY                  Telnyx API key (alternative to --api-key).
  TELNYX_MCP_ACCEPT_FULL_SCOPE    Set to 1 to opt in to per-account
                                  provisioning. The injected secret is your
                                  raw Telnyx API key — VM escape or prompt
                                  injection inside the MCP func can exfiltrate
                                  a full-scope key. Without this var, the
                                  shim stays on the shared hosted endpoint.
  TELNYX_MCP_URL                  Override the resolved endpoint with an
                                  explicit URL (advanced).
  TELNYX_MCP_RESET                Any non-empty value acts like --reset.

On first run (with consent), the shim creates a secret and provisions an
isolated MCP endpoint on Telnyx Edge Compute for your account, then caches
the URL at ~/.telnyx/mcp-endpoint.json. If provisioning is unavailable, it
falls back to the shared hosted endpoint at https://api.telnyx.com/v2/mcp.`);
    process.exit(0);
  }

  const reset = process.argv.includes("--reset");
  const apiKey = getApiKey();
  const { url, remoteAuthToken, source } = await resolveEndpoint({ apiKey, reset });

  switch (source) {
    case "provisioned":
      console.error(`[telnyx-mcp] provisioned isolated endpoint: ${url}`);
      break;
    case "fallback-no-consent":
      console.error(
        "[telnyx-mcp] using shared hosted endpoint. To provision an isolated " +
          "per-account endpoint, set TELNYX_MCP_ACCEPT_FULL_SCOPE=1 (see --help)."
      );
      break;
    case "fallback-error":
      console.error(
        "[telnyx-mcp] provisioning unavailable — falling back to shared endpoint."
      );
      break;
    // "cache" and "override" stay silent.
  }

  await createProxy({ remoteUrl: url, remoteAuthToken });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
