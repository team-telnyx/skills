/**
 * telnyx-agent setup-edge-mcp — Thin executable handoff for MCP-on-Edge.
 *
 * This command does not deploy anything itself. It verifies that the dedicated
 * `telnyx-edge` CLI is present and returns the concrete example / commands to
 * start from.
 */

import { outputJson, printError, printSuccess, printWarning } from "../utils/output.ts";
import { hasEdgeCli } from "../edge-cli.ts";

interface SetupEdgeMcpResult {
  ready: boolean;
  example: string;
  deploy_command: string;
  prerequisites: string[];
  notes: string[];
}

const MCP_EXAMPLE = "examples/ts/mcp-server";

export async function setupEdgeMcpCommand(flags: Record<string, string | boolean>): Promise<void> {
  const jsonOutput = flags.json === true;
  const name = (flags.name as string) || "my-mcp-server";

  const hasEdge = hasEdgeCli();
  const deployCommand = `telnyx-edge new-func --from-dir=${MCP_EXAMPLE} --name=${name} && cd ${name} && telnyx-edge ship`;

  const result: SetupEdgeMcpResult = {
    ready: hasEdge,
    example: MCP_EXAMPLE,
    deploy_command: deployCommand,
    prerequisites: [
      "Install telnyx-edge",
      "Run telnyx-edge auth login",
      "Use a real Edge Compute example as the starting point",
    ],
    notes: [
      "team-telnyx/ai provides the integration pattern, not the Edge lifecycle.",
      "Use telnyx-edge for auth, deploy, secrets, bindings, and lifecycle management.",
      "After deploy, connect the exposed MCP or HTTP boundary back into your AI workflow.",
    ],
  };

  if (jsonOutput) {
    outputJson(result);
    return;
  }

  if (hasEdge) {
    printSuccess("Edge MCP handoff is ready", {
      Example: MCP_EXAMPLE,
      Ready: "✓",
    });
  } else {
    printError("telnyx-edge is not installed.");
    printWarning("This command is a handoff helper — it depends on the dedicated Edge Compute CLI.");
  }

  console.log(`  Example template: ${MCP_EXAMPLE}`);
  console.log(`  Suggested flow: ${deployCommand}`);
  console.log("\n  Notes:");
  for (const note of result.notes) {
    console.log(`    - ${note}`);
  }
  console.log();
}

