import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";

export const SHARED_MCP_URL = "https://api.telnyx.com/v2/mcp";
const SECRETS_API = "https://api.telnyx.com/v2/compute/secrets";
const DEPLOY_API = "https://api.telnyx.com/v2/compute/mcp/deploy";
const PROVISION_TIMEOUT_MS = 10_000;

function cachePath(): string {
  return join(homedir(), ".telnyx", "mcp-endpoint.json");
}

interface CacheEntry {
  apiKeyFingerprint: string;
  url: string;
  funcId: string;
  secretId: string;
  /**
   * Bearer token the shim must send when proxying MCP requests to {@link url}.
   * Generated server-side by the deploy API and returned exactly once — there
   * is no API to recover the value if cache is lost (Telnyx secrets list
   * returns names only). On cache loss, --reset re-provisions a fresh secret.
   */
  sharedSecret: string;
  provisionedAt: string;
}

interface ResolveOptions {
  apiKey: string;
  reset?: boolean;
}

export interface ResolveResult {
  /** URL to proxy MCP traffic to. */
  url: string;
  /** Bearer token to send with MCP requests to {@link url}. */
  remoteAuthToken: string;
  source:
    | "override"
    | "cache"
    | "provisioned"
    | "fallback-no-consent"
    | "fallback-error";
}

function fingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}

function hasConsent(): boolean {
  const v = process.env.TELNYX_MCP_ACCEPT_FULL_SCOPE;
  return !!v && v !== "0" && v.toLowerCase() !== "false";
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

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * Find an existing secret by name, or create a new one holding the API key.
 * Uses a deterministic name derived from the API key fingerprint so repeated
 * calls with the same key reuse the same secret (idempotent across cache resets
 * and cold starts without relying on POST-side 409 handling).
 */
async function ensureSecret(apiKey: string, fp: string, signal: AbortSignal): Promise<string | null> {
  const secretName = `mcp-shim-${fp}`;
  const headers = authHeaders(apiKey);

  // Look up existing secret by name first.
  const listUrl = `${SECRETS_API}?filter[name]=${encodeURIComponent(secretName)}`;
  const listRes = await fetch(listUrl, { headers, signal });
  if (listRes.ok) {
    const body = (await listRes.json()) as { data?: Array<{ id?: string; name?: string }> };
    const existing = body.data?.find((s) => s.name === secretName);
    if (existing?.id) return existing.id;
  }

  // Create new.
  const createRes = await fetch(SECRETS_API, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: secretName, value: apiKey }),
    signal,
  });
  if (!createRes.ok) return null;
  const body = (await createRes.json()) as { data?: { id?: string } };
  return body.data?.id ?? null;
}

async function provision(apiKey: string): Promise<CacheEntry | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVISION_TIMEOUT_MS);
  const fp = fingerprint(apiKey);
  try {
    const secretId = await ensureSecret(apiKey, fp, controller.signal);
    if (!secretId) return null;

    const deployRes = await fetch(DEPLOY_API, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        name: "default-mcp",
        api_key_secret_id: secretId,
      }),
      signal: controller.signal,
    });
    if (!deployRes.ok) return null;
    const body = (await deployRes.json()) as {
      data?: { url?: string; func_id?: string; shared_secret?: string };
    };
    if (!body.data?.url || !body.data.func_id || !body.data.shared_secret) {
      return null;
    }

    return {
      apiKeyFingerprint: fp,
      url: body.data.url,
      funcId: body.data.func_id,
      secretId,
      sharedSecret: body.data.shared_secret,
      provisionedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolve the MCP endpoint URL and the bearer token to use against it.
 *
 * Order of preference:
 *   1. TELNYX_MCP_URL env var (explicit override)
 *   2. Cached per-tenant URL (if API-key fingerprint matches)
 *   3. Fresh provision via deploy API (requires TELNYX_MCP_ACCEPT_FULL_SCOPE)
 *   4. Shared hosted URL (fallback)
 *
 * Per-tenant URLs require an inbound SHARED_SECRET as bearer (separate from
 * the user's API key, which the deployed func uses for upstream Telnyx calls).
 * The shared URL accepts the API key directly. This resolver returns the
 * appropriate bearer for the chosen URL so callers don't have to track which.
 *
 * Provisioning is gated on TELNYX_MCP_ACCEPT_FULL_SCOPE because the injected
 * upstream secret is the user's raw Telnyx API key — compromise of the
 * Firecracker VM (e.g., via prompt-injected agent code in Code Mode) leaks a
 * full-scope key. Users opt in explicitly; otherwise the shim stays on the
 * shared URL.
 */
export async function resolveEndpoint(options: ResolveOptions): Promise<ResolveResult> {
  const override = process.env.TELNYX_MCP_URL;
  if (override) {
    // Override skips provisioning — caller must trust the URL accepts the
    // raw API key as bearer (matches the shared-URL contract).
    return { url: override, remoteAuthToken: options.apiKey, source: "override" };
  }

  if (options.reset || process.env.TELNYX_MCP_RESET) {
    await clearCache();
  }

  const fp = fingerprint(options.apiKey);
  const cached = await readCache();
  if (cached && cached.apiKeyFingerprint === fp) {
    return {
      url: cached.url,
      remoteAuthToken: cached.sharedSecret,
      source: "cache",
    };
  }

  if (!hasConsent()) {
    return {
      url: SHARED_MCP_URL,
      remoteAuthToken: options.apiKey,
      source: "fallback-no-consent",
    };
  }

  const provisioned = await provision(options.apiKey);
  if (provisioned) {
    await writeCache(provisioned);
    return {
      url: provisioned.url,
      remoteAuthToken: provisioned.sharedSecret,
      source: "provisioned",
    };
  }

  return {
    url: SHARED_MCP_URL,
    remoteAuthToken: options.apiKey,
    source: "fallback-error",
  };
}
