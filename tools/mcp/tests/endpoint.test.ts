import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveEndpoint, SHARED_MCP_URL } from "../src/endpoint.js";

const API_KEY = "KEY_test_1234";
const PER_TENANT_URL = "https://default-mcp-acme.telnyxcompute.com/mcp";
const FUNC_ID = "func_01HXYZ";
const SECRET_ID = "sec_01HABC";

const SECRETS_API = "https://api.telnyx.com/v2/compute/secrets";
const DEPLOY_API = "https://api.telnyx.com/v2/compute/mcp/deploy";

const originalFetch = globalThis.fetch;
const originalHome = process.env.HOME;
const originalMcpUrl = process.env.TELNYX_MCP_URL;
const originalMcpReset = process.env.TELNYX_MCP_RESET;
const originalConsent = process.env.TELNYX_MCP_ACCEPT_FULL_SCOPE;

let tmpHome: string;

interface CapturedCall {
  url: string;
  init: RequestInit;
}

/**
 * Install a simple fetch stub that routes by URL prefix.
 * Returns an array that captures every call for assertions.
 */
function installFetchRouter(handlers: {
  secretsList?: (url: string, init: RequestInit) => Promise<Response>;
  secretsCreate?: (url: string, init: RequestInit) => Promise<Response>;
  deploy?: (url: string, init: RequestInit) => Promise<Response>;
}): CapturedCall[] {
  const captured: CapturedCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const initOrEmpty = init ?? {};
    captured.push({ url, init: initOrEmpty });
    if (url.startsWith(SECRETS_API) && initOrEmpty.method === "POST") {
      if (!handlers.secretsCreate) throw new Error(`unexpected POST ${url}`);
      return handlers.secretsCreate(url, initOrEmpty);
    }
    if (url.startsWith(SECRETS_API)) {
      if (!handlers.secretsList) throw new Error(`unexpected GET ${url}`);
      return handlers.secretsList(url, initOrEmpty);
    }
    if (url.startsWith(DEPLOY_API)) {
      if (!handlers.deploy) throw new Error(`unexpected deploy ${url}`);
      return handlers.deploy(url, initOrEmpty);
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  return captured;
}

function secretsListEmpty(): Response {
  return new Response(JSON.stringify({ data: [] }), { status: 200 });
}

function secretsListExisting(name: string): Response {
  return new Response(
    JSON.stringify({ data: [{ id: SECRET_ID, name }] }),
    { status: 200 },
  );
}

function secretsCreateOk(): Response {
  return new Response(
    JSON.stringify({ data: { id: SECRET_ID, name: "mcp-shim-xxx" } }),
    { status: 201 },
  );
}

function deployOk(): Response {
  return new Response(
    JSON.stringify({
      data: { url: PER_TENANT_URL, func_id: FUNC_ID, status: "ready" },
    }),
    { status: 200 },
  );
}

function cacheFile(): string {
  return join(tmpHome, ".telnyx", "mcp-endpoint.json");
}

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "telnyx-mcp-test-"));
  process.env.HOME = tmpHome;
  delete process.env.TELNYX_MCP_URL;
  delete process.env.TELNYX_MCP_RESET;
  process.env.TELNYX_MCP_ACCEPT_FULL_SCOPE = "1";
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalMcpUrl === undefined) delete process.env.TELNYX_MCP_URL;
  else process.env.TELNYX_MCP_URL = originalMcpUrl;
  if (originalMcpReset === undefined) delete process.env.TELNYX_MCP_RESET;
  else process.env.TELNYX_MCP_RESET = originalMcpReset;
  if (originalConsent === undefined) delete process.env.TELNYX_MCP_ACCEPT_FULL_SCOPE;
  else process.env.TELNYX_MCP_ACCEPT_FULL_SCOPE = originalConsent;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe("resolveEndpoint", () => {
  describe("override", () => {
    it("TELNYX_MCP_URL wins over everything else", async () => {
      process.env.TELNYX_MCP_URL = "https://custom.example/mcp";
      globalThis.fetch = (async () => {
        throw new Error("fetch should not be called when override is set");
      }) as typeof fetch;
      const { url, source } = await resolveEndpoint({ apiKey: API_KEY });
      assert.equal(url, "https://custom.example/mcp");
      assert.equal(source, "override");
    });
  });

  describe("consent gate", () => {
    it("without TELNYX_MCP_ACCEPT_FULL_SCOPE, skips provisioning", async () => {
      delete process.env.TELNYX_MCP_ACCEPT_FULL_SCOPE;
      globalThis.fetch = (async () => {
        throw new Error("fetch should not be called without consent");
      }) as typeof fetch;
      const { url, source } = await resolveEndpoint({ apiKey: API_KEY });
      assert.equal(url, SHARED_MCP_URL);
      assert.equal(source, "fallback-no-consent");
    });

    it("TELNYX_MCP_ACCEPT_FULL_SCOPE=0 is treated as no consent", async () => {
      process.env.TELNYX_MCP_ACCEPT_FULL_SCOPE = "0";
      const { source } = await resolveEndpoint({ apiKey: API_KEY });
      assert.equal(source, "fallback-no-consent");
    });

    it("TELNYX_MCP_ACCEPT_FULL_SCOPE=false is treated as no consent", async () => {
      process.env.TELNYX_MCP_ACCEPT_FULL_SCOPE = "false";
      const { source } = await resolveEndpoint({ apiKey: API_KEY });
      assert.equal(source, "fallback-no-consent");
    });
  });

  describe("provisioning — new secret", () => {
    it("creates secret when none exists, then deploys with secret id", async () => {
      const calls = installFetchRouter({
        secretsList: async () => secretsListEmpty(),
        secretsCreate: async () => secretsCreateOk(),
        deploy: async () => deployOk(),
      });
      const { url, source } = await resolveEndpoint({ apiKey: API_KEY });
      assert.equal(url, PER_TENANT_URL);
      assert.equal(source, "provisioned");

      assert.equal(calls.length, 3);
      const [list, create, deploy] = calls;
      assert.match(list.url, /filter\[name\]=mcp-shim-/);
      assert.equal(create.init.method, "POST");
      assert.equal(deploy.url, DEPLOY_API);

      const deployBody = JSON.parse(String(deploy.init.body));
      assert.equal(deployBody.name, "default-mcp");
      assert.equal(deployBody.api_key_secret_id, SECRET_ID);

      const cached = JSON.parse(await fs.readFile(cacheFile(), "utf8"));
      assert.equal(cached.url, PER_TENANT_URL);
      assert.equal(cached.funcId, FUNC_ID);
      assert.equal(cached.secretId, SECRET_ID);
    });
  });

  describe("provisioning — existing secret", () => {
    it("reuses secret when list returns a match, skipping create", async () => {
      const calls = installFetchRouter({
        secretsList: async (url) => {
          const match = url.match(/filter\[name\]=([^&]+)/);
          return secretsListExisting(decodeURIComponent(match![1]));
        },
        secretsCreate: async () => {
          throw new Error("create should not be called when secret exists");
        },
        deploy: async () => deployOk(),
      });
      const { url, source } = await resolveEndpoint({ apiKey: API_KEY });
      assert.equal(source, "provisioned");
      assert.equal(url, PER_TENANT_URL);
      assert.equal(calls.length, 2, "only list + deploy, no create");
    });
  });

  describe("provisioning failure modes", () => {
    it("secret create 500 falls back", async () => {
      installFetchRouter({
        secretsList: async () => secretsListEmpty(),
        secretsCreate: async () => new Response("oops", { status: 500 }),
      });
      const { url, source } = await resolveEndpoint({ apiKey: API_KEY });
      assert.equal(url, SHARED_MCP_URL);
      assert.equal(source, "fallback-error");
      await assert.rejects(fs.access(cacheFile()));
    });

    it("deploy 404 falls back", async () => {
      installFetchRouter({
        secretsList: async () => secretsListEmpty(),
        secretsCreate: async () => secretsCreateOk(),
        deploy: async () => new Response("nope", { status: 404 }),
      });
      const { source } = await resolveEndpoint({ apiKey: API_KEY });
      assert.equal(source, "fallback-error");
      await assert.rejects(fs.access(cacheFile()));
    });

    it("deploy response missing url is treated as failure", async () => {
      installFetchRouter({
        secretsList: async () => secretsListEmpty(),
        secretsCreate: async () => secretsCreateOk(),
        deploy: async () =>
          new Response(JSON.stringify({ data: { func_id: FUNC_ID } }), {
            status: 200,
          }),
      });
      const { source } = await resolveEndpoint({ apiKey: API_KEY });
      assert.equal(source, "fallback-error");
    });

    it("network error during secret step falls back", async () => {
      globalThis.fetch = (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch;
      const { url, source } = await resolveEndpoint({ apiKey: API_KEY });
      assert.equal(url, SHARED_MCP_URL);
      assert.equal(source, "fallback-error");
    });

    it("aborted fetch falls back", async () => {
      globalThis.fetch = (async () => {
        throw new DOMException("aborted", "AbortError");
      }) as typeof fetch;
      const { source } = await resolveEndpoint({ apiKey: API_KEY });
      assert.equal(source, "fallback-error");
    });
  });

  describe("cache hits", () => {
    it("returns cached URL without any fetch calls", async () => {
      installFetchRouter({
        secretsList: async () => secretsListEmpty(),
        secretsCreate: async () => secretsCreateOk(),
        deploy: async () => deployOk(),
      });
      await resolveEndpoint({ apiKey: API_KEY });

      // Fail any further fetch call — second resolve should not need fetch.
      globalThis.fetch = (async () => {
        throw new Error("cache hit should not call fetch");
      }) as typeof fetch;
      const second = await resolveEndpoint({ apiKey: API_KEY });
      assert.equal(second.source, "cache");
      assert.equal(second.url, PER_TENANT_URL);
    });

    it("different API key invalidates cache and re-provisions", async () => {
      installFetchRouter({
        secretsList: async () => secretsListEmpty(),
        secretsCreate: async () => secretsCreateOk(),
        deploy: async () => deployOk(),
      });
      await resolveEndpoint({ apiKey: API_KEY });
      const rotated = await resolveEndpoint({ apiKey: "KEY_rotated_9999" });
      assert.equal(rotated.source, "provisioned");
    });
  });

  describe("reset", () => {
    it("--reset clears cache and re-provisions", async () => {
      installFetchRouter({
        secretsList: async () => secretsListEmpty(),
        secretsCreate: async () => secretsCreateOk(),
        deploy: async () => deployOk(),
      });
      await resolveEndpoint({ apiKey: API_KEY });
      const reset = await resolveEndpoint({ apiKey: API_KEY, reset: true });
      assert.equal(reset.source, "provisioned");
    });

    it("TELNYX_MCP_RESET env var clears cache", async () => {
      installFetchRouter({
        secretsList: async () => secretsListEmpty(),
        secretsCreate: async () => secretsCreateOk(),
        deploy: async () => deployOk(),
      });
      await resolveEndpoint({ apiKey: API_KEY });
      process.env.TELNYX_MCP_RESET = "1";
      const reset = await resolveEndpoint({ apiKey: API_KEY });
      assert.equal(reset.source, "provisioned");
    });
  });

  describe("request headers", () => {
    it("sends Bearer auth and JSON content-type to both endpoints", async () => {
      const calls = installFetchRouter({
        secretsList: async () => secretsListEmpty(),
        secretsCreate: async () => secretsCreateOk(),
        deploy: async () => deployOk(),
      });
      await resolveEndpoint({ apiKey: API_KEY });
      for (const c of calls) {
        const headers = c.init.headers as Record<string, string>;
        assert.equal(headers.Authorization, `Bearer ${API_KEY}`);
        assert.equal(headers["Content-Type"], "application/json");
      }
    });
  });
});
