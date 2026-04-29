/**
 * telnyx-agent edge-doctor — Validate local Edge Compute prerequisites.
 *
 * This is a thin handoff command: it does not deploy or manage Edge Compute
 * directly. It checks that the dedicated `telnyx-edge` CLI is available and
 * gives the user a concrete next step.
 */

import { outputJson, printError, printSuccess, printWarning } from "../utils/output.ts";
import { getEdgeHelp, hasEdgeCli } from "../edge-cli.ts";

interface EdgeDoctorResult {
  ready: boolean;
  telnyx_edge_installed: boolean;
  telnyx_edge_version: string | null;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
  next_steps: string[];
}

export async function edgeDoctorCommand(flags: Record<string, string | boolean>): Promise<void> {
  const jsonOutput = flags.json === true;

  const checks: EdgeDoctorResult["checks"] = [];
  let installed = false;
  let version: string | null = null;

  try {
    const out = getEdgeHelp();
    installed = hasEdgeCli();
    version = extractVersion(out) ?? "installed";
    checks.push({
      name: "telnyx-edge installed",
      ok: true,
      detail: version,
    });
  } catch (err: any) {
    const detail = err?.code === "ENOENT"
      ? "telnyx-edge not found on PATH"
      : (err?.stderr?.toString?.() || err?.message || "failed to execute telnyx-edge");
    checks.push({
      name: "telnyx-edge installed",
      ok: false,
      detail,
    });
  }

  const nextSteps = installed
    ? [
        "Run: telnyx-edge auth login",
        "Start from a real example: telnyx-edge new-func --from-dir=examples/ts/mcp-server --name=my-mcp-server",
        "Deploy with: telnyx-edge ship",
        "Then connect your deployed HTTP or MCP boundary back into your AI workflow.",
      ]
    : [
        "Install the dedicated Edge Compute CLI from team-telnyx/edge-compute releases.",
        "Then run: telnyx-edge auth login",
        "Then start from a real example such as examples/ts/mcp-server or examples/js/webhook-receiver.",
      ];

  const result: EdgeDoctorResult = {
    ready: installed,
    telnyx_edge_installed: installed,
    telnyx_edge_version: version,
    checks,
    next_steps: nextSteps,
  };

  if (jsonOutput) {
    outputJson(result);
    return;
  }

  if (installed) {
    printSuccess("Edge Compute handoff is ready", {
      "telnyx-edge": version ?? "installed",
      Ready: "✓",
    });
  } else {
    printError("Edge Compute handoff is not ready yet.");
    printWarning("Install telnyx-edge first — team-telnyx/ai does not own Edge lifecycle directly.");
  }

  console.log("  Checks:");
  for (const check of checks) {
    console.log(`    ${check.ok ? "✓" : "✗"} ${check.name}: ${check.detail}`);
  }
  console.log("\n  Next steps:");
  for (const step of nextSteps) {
    console.log(`    - ${step}`);
  }
  console.log();
}

function extractVersion(text: string): string | null {
  const match = text.match(/v?\d+\.\d+\.\d+/);
  return match?.[0] ?? null;
}
