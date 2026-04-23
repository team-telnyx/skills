import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";

export const SHARED_MCP_URL = "https://api.telnyx.com/v2/mcp";
const DEPLOY_API = "https://api.telnyx.com/v2/compute/mcp/deploy";
const PROVISION_TIMEOUT_MS = 10_000;

function cachePath(): string {
  return join(homedir(), ".telnyx", "mcp-endpoint.json");
}

interface CacheEntry {
  apiKeyFingerprint: string;
  url: string;
  funcId: string;
  provisionedAt: string;
}

interface ResolveOptions {
  apiKey: string;
  reset?: boolean;
}

export interface ResolveResult {
  url: string;
  source: "override" | "cache" | "provisioned" | "fallback";
}

function fingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}

async function readCache(): Promise<CacheEntry | null> {
  try {
    const raw = await fs.readFile(cachePath(), "utf8");
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

async function writeCache(entry: CacheEntry): Promise<void> {
  await fs.mkdir(dirname(cachePath()), { recursive: true });
  await fs.writeFile(cachePath(), JSON.stringify(entry, null, 2), { mode: 0o600 });
}

async function clearCache(): Promise<void> {
  try {
    await fs.unlink(cachePath());
  } catch {
    // cache already absent — fine
  }
}

async function provision(apiKey: string): Promise<CacheEntry | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVISION_TIMEOUT_MS);
  try {
    const res = await fetch(DEPLOY_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "default-mcp" }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { url?: string; func_id?: string } };
    if (!body.data?.url || !body.data.func_id) return null;
    return {
      apiKeyFingerprint: fingerprint(apiKey),
      url: body.data.url,
      funcId: body.data.func_id,
      provisionedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolve the MCP endpoint URL for this API key.
 *
 * Order of preference:
 *   1. TELNYX_MCP_URL env var (explicit override)
 *   2. Cached per-tenant URL from a prior successful provision (if fingerprint matches)
 *   3. Fresh provision via deploy API
 *   4. Shared hosted URL (fallback — preserves today's behavior if deploy unavailable)
 */
export async function resolveEndpoint(options: ResolveOptions): Promise<ResolveResult> {
  const override = process.env.TELNYX_MCP_URL;
  if (override) return { url: override, source: "override" };

  if (options.reset || process.env.TELNYX_MCP_RESET) {
    await clearCache();
  }

  const fp = fingerprint(options.apiKey);
  const cached = await readCache();
  if (cached && cached.apiKeyFingerprint === fp) {
    return { url: cached.url, source: "cache" };
  }

  const provisioned = await provision(options.apiKey);
  if (provisioned) {
    await writeCache(provisioned);
    return { url: provisioned.url, source: "provisioned" };
  }

  return { url: SHARED_MCP_URL, source: "fallback" };
}
