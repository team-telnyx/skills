/**
 * telnyx-agent setup-edge-webhook — Thin executable handoff for webhook-on-Edge.
 */

import { outputJson, printError, printSuccess, printWarning } from "../utils/output.ts";
import { hasEdgeCli } from "../edge-cli.ts";

interface SetupEdgeWebhookResult {
  ready: boolean;
  example: string;
  deploy_command: string;
  prerequisites: string[];
  notes: string[];
}

const WEBHOOK_EXAMPLE = "examples/js/webhook-receiver";

export async function setupEdgeWebhookCommand(flags: Record<string, string | boolean>): Promise<void> {
  const jsonOutput = flags.json === true;
  const name = (flags.name as string) || "my-webhook-receiver";

  const hasEdge = hasEdgeCli();
  const deployCommand = `telnyx-edge new-func --from-dir=${WEBHOOK_EXAMPLE} --name=${name} && cd ${name} && telnyx-edge ship`;

  const result: SetupEdgeWebhookResult = {
    ready: hasEdge,
    example: WEBHOOK_EXAMPLE,
    deploy_command: deployCommand,
    prerequisites: [
      "Install telnyx-edge",
      "Run telnyx-edge auth login",
      "Start from the webhook receiver example",
    ],
    notes: [
      "Use this when your AI workflow needs an HTTP ingress point at the edge.",
      "The deployed function lifecycle is still owned by telnyx-edge.",
      "After deploy, point your webhook-producing system at the Edge endpoint and let team-telnyx/ai handle orchestration guidance.",
    ],
  };

  if (jsonOutput) {
    outputJson(result);
    return;
  }

  if (hasEdge) {
    printSuccess("Edge webhook handoff is ready", {
      Example: WEBHOOK_EXAMPLE,
      Ready: "✓",
    });
  } else {
    printError("telnyx-edge is not installed.");
    printWarning("This command is a handoff helper — it depends on the dedicated Edge Compute CLI.");
  }

  console.log(`  Example template: ${WEBHOOK_EXAMPLE}`);
  console.log(`  Suggested flow: ${deployCommand}`);
  console.log("\n  Notes:");
  for (const note of result.notes) {
    console.log(`    - ${note}`);
  }
  console.log();
}

