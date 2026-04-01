/**
 * Telnyx CLI wrapper — shells out to `telnyx` CLI with `--json` for structured output.
 *
 * The telnyx CLI (from @telnyx/api-cli) outputs:
 * - JSON to stdout (when --json is passed)
 * - Info/progress messages to stderr
 * - Non-zero exit code on API errors
 *
 * Auth: Reads TELNYX_API_KEY env var or ~/.config/telnyx/config.json profiles.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Find the start of JSON in CLI output that may have info messages before it.
 * Looks for the first `{` or `[` that starts valid JSON.
 */
function findJsonStart(text: string): number {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{" || ch === "[") {
      // Quick validation: try to parse from this point
      try {
        JSON.parse(text.slice(i));
        return i;
      } catch {
        // Not valid JSON from here, keep looking
      }
    }
  }
  return -1;
}

export class TelnyxCLIError extends Error {
  readonly exitCode: number;
  readonly stderr: string;
  constructor(exitCode: number, stderr: string) {
    super(`telnyx CLI exited with code ${exitCode}: ${stderr}`);
    this.name = "TelnyxCLIError";
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

/**
 * Run a telnyx CLI command and return parsed JSON output.
 * Automatically appends `--json` to all commands.
 *
 * @param args - CLI arguments (e.g., ['number', 'search', '--country', 'US'])
 * @param opts - Optional overrides for timeout and env
 * @returns Parsed JSON response from the CLI (typically { data: ... } or { data: [...], meta: ... })
 */
export async function telnyxCli(
  args: string[],
  opts?: { timeout?: number; env?: Record<string, string | undefined> },
): Promise<any> {
  const timeout = opts?.timeout ?? 60000;
  try {
    const { stdout } = await execFileAsync("telnyx", [...args, "--json"], {
      env: { ...process.env, ...opts?.env } as NodeJS.ProcessEnv,
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB — some list responses can be large
    });
    const trimmed = stdout.trim();
    if (!trimmed) return {};
    // The CLI sometimes outputs info messages (e.g., "ℹ Fetching...") to stdout
    // before the JSON. Find the first { or [ to locate the JSON start.
    const jsonStart = findJsonStart(trimmed);
    if (jsonStart < 0) {
      throw new Error(`No JSON found in telnyx CLI output: ${trimmed.slice(0, 200)}`);
    }
    return JSON.parse(trimmed.slice(jsonStart));
  } catch (err: any) {
    // execFile error with exit code
    if (err.code === "ENOENT") {
      throw new Error(
        "telnyx CLI not found. Install it with: npm install -g @telnyx/api-cli",
      );
    }
    if (err.killed) {
      throw new Error(`telnyx CLI timed out after ${timeout}ms`);
    }
    if (err.status !== undefined || err.code !== undefined) {
      const exitCode = err.status ?? err.code ?? 1;
      const rawStdout = err.stdout?.toString() || "";
      const rawStderr = err.stderr?.toString() || "";
      // Combine both streams — the CLI may write errors to either
      const errorText = rawStdout + rawStderr;
      // Try to find and parse JSON in the error output
      const jsonStart = findJsonStart(errorText);
      if (jsonStart >= 0) {
        try {
          const errorJson = JSON.parse(errorText.slice(jsonStart));
          throw new TelnyxCLIError(
            typeof exitCode === "number" ? exitCode : 1,
            JSON.stringify(errorJson),
          );
        } catch (parseErr) {
          if (parseErr instanceof TelnyxCLIError) throw parseErr;
        }
      }
      // No JSON — extract the human-readable error message
      // The CLI formats errors as: "    TelnyxApiError: <message>\n    Code: <code>"
      const cleanError = errorText
        .split("\n")
        .map((line: string) => line.trim())
        .filter((line: string) => line && !line.startsWith("ℹ"))
        .join(" ");
      throw new TelnyxCLIError(
        typeof exitCode === "number" ? exitCode : 1,
        cleanError || errorText.trim(),
      );
    }
    throw err;
  }
}
