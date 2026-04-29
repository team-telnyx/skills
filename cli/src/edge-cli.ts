import { execFileSync } from "node:child_process";

export function resolveEdgeBinary(): string {
  return process.env.TELNYX_EDGE_PATH || "telnyx-edge";
}

export function hasEdgeCli(): boolean {
  try {
    execFileSync(resolveEdgeBinary(), ["--help"], {
      encoding: "utf8",
      timeout: 15000,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

export function getEdgeHelp(): string {
  return execFileSync(resolveEdgeBinary(), ["--help"], {
    encoding: "utf8",
    timeout: 15000,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
}
