import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, "..", "bin", "telnyx-agent.ts");

function withFakeEdgeCli() {
  const tempDir = mkdtempSync(join(tmpdir(), "telnyx-edge-fake-"));
  const binDir = join(tempDir, "bin");
  mkdirSync(binDir, { recursive: true });
  const fakeEdge = join(binDir, "telnyx-edge");
  writeFileSync(
    fakeEdge,
    `#!/usr/bin/env node
if (process.argv.includes("--help")) {
  console.log(["telnyx-edge v0.1.0", "Commands: auth login, ship, list, secrets, bindings"].join("\\n"));
  process.exit(0);
}
console.log("ok");
`,
  );
  chmodSync(fakeEdge, 0o755);
  return {
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      TELNYX_EDGE_PATH: fakeEdge,
    },
  };
}

function run(args: string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync("npx", ["tsx", CLI, ...args], {
    encoding: "utf8",
    timeout: 30000,
    env: env ?? { ...process.env },
  });
}

describe("CLI — Edge Compute handoff", () => {
  it("help lists edge handoff commands", () => {
    const output = run(["help"]);
    assert.ok(output.includes("edge-doctor"), "Should list edge-doctor");
    assert.ok(output.includes("setup-edge-mcp"), "Should list setup-edge-mcp");
    assert.ok(output.includes("setup-edge-webhook"), "Should list setup-edge-webhook");
  });

  it("capabilities JSON includes edge handoff entries", () => {
    const output = run(["capabilities", "--json"]);
    const data = JSON.parse(output);
    const networkingLike = Object.keys(data.api_capabilities || {}).find((k) => k.includes("Edge Compute"));
    assert.ok(networkingLike, "Should include Edge Compute category");

    const commands = data.composite_commands.map((c: any) => c.name || c.command || c);
    assert.ok(commands.some((c: string) => c.includes("edge-doctor")), "Should advertise edge-doctor");
    assert.ok(commands.some((c: string) => c.includes("setup-edge-mcp")), "Should advertise setup-edge-mcp");
    assert.ok(commands.some((c: string) => c.includes("setup-edge-webhook")), "Should advertise setup-edge-webhook");
  });

  it("edge-doctor reports ready when telnyx-edge is installed", () => {
    const fake = withFakeEdgeCli();
    const output = run(["edge-doctor", "--json"], fake.env);
    const data = JSON.parse(output);
    if (process.env.DEBUG_EDGE_TESTS) console.log("edge-doctor output", data);
    assert.equal(data.ready, true);
    assert.equal(data.telnyx_edge_installed, true);
    assert.ok(Array.isArray(data.next_steps));
  });

  it("setup-edge-mcp returns a concrete deploy handoff", () => {
    const fake = withFakeEdgeCli();
    const output = run(["setup-edge-mcp", "--json", "--name", "demo-mcp"], fake.env);
    const data = JSON.parse(output);
    if (process.env.DEBUG_EDGE_TESTS) console.log("setup-edge-mcp output", data);
    assert.equal(data.ready, true);
    assert.equal(data.example, "examples/ts/mcp-server");
    assert.ok(data.deploy_command.includes("telnyx-edge new-func"));
    assert.ok(data.deploy_command.includes("demo-mcp"));
  });

  it("setup-edge-webhook returns a concrete deploy handoff", () => {
    const fake = withFakeEdgeCli();
    const output = run(["setup-edge-webhook", "--json", "--name", "demo-webhook"], fake.env);
    const data = JSON.parse(output);
    if (process.env.DEBUG_EDGE_TESTS) console.log("setup-edge-webhook output", data);
    assert.equal(data.ready, true);
    assert.equal(data.example, "examples/js/webhook-receiver");
    assert.ok(data.deploy_command.includes("telnyx-edge new-func"));
    assert.ok(data.deploy_command.includes("demo-webhook"));
  });
});
