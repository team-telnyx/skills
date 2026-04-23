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

const originalFetch = globalThis.fetch;
const originalHome = process.env.HOME;
const originalMcpUrl = process.env.TELNYX_MCP_URL;
const originalMcpReset = process.env.TELNYX_MCP_RESET;

let tmpHome: string;

function setFetch(impl: typeof fetch): void {
  globalThis.fetch = impl;
}

function cacheFile(): string {
  return join(tmpHome, ".telnyx", "mcp-endpoint.json");
}

function successResponse(): Response {
  return new Response(
    JSON.stringify({
      data: { url: PER_TENANT_URL, func_id: FUNC_ID, status: "ready" },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "telnyx-mcp-test-"));
  process.env.HOME = tmpHome;
  delete process.env.TELNYX_MCP_URL;
  delete process.env.TELNYX_MCP_RESET;
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalMcpUrl === undefined) delete process.env.TELNYX_MCP_URL;
  else process.env.TELNYX_MCP_URL = originalMcpUrl;
  if (originalMcpReset === undefined) delete process.env.TELNYX_MCP_RESET;
  else process.env.TELNYX_MCP_RESET = originalMcpReset;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe("resolveEndpoint", () => {
  describe("override", () => {
    it("TELNYX_MCP_URL wins over everything else", async () => {
      process.env.TELNYX_MCP_URL = "https://custom.example/mcp";
      setFetch(async () => {
        throw new Error("fetch should not be called when override is set");
      });
      const { url, source } = await resolveEndpoint({ apiKey: API_KEY });
      assert.equal(url, "https://custom.example/mcp");
      assert.equal(source, "override");
    });
  });

  describe("provisioning success", () => {
    it("calls deploy API, caches, returns per-tenant URL", async () => {
      let callCount = 0;
      setFetch(async () => {
        callCount++;
        return successResponse();
      });
      const { url, source } = await resolveEndpoint({ apiKey: API_KEY });
      assert.equal(url, PER_TENANT_URL);
      assert.equal(source, "provisioned");
      assert.equal(callCount, 1);

      const cached = JSON.parse(await fs.readFile(cacheFile(), "utf8"));
      assert.equal(cached.url, PER_TENANT_URL);
      assert.equal(cached.funcId, FUNC_ID);
      assert.ok(cached.apiKeyFingerprint);
      assert.ok(cached.provisionedAt);
    });

    it("response missing data.url is treated as failure", async () => {
      setFetch(async () =>
        new Response(JSON.stringify({ data: { func_id: FUNC_ID } }), { status: 200 }),
      );
      const { url, source } = await resolveEndpoint({ apiKey: API_KEY });
      assert.equal(url, SHARED_MCP_URL);
      assert.equal(source, "fallback");
    });
  });

  describe("cache hits", () => {
    it("returns cached URL without calling deploy API", async () => {
      let callCount = 0;
      setFetch(async () => {
        callCount++;
        return successResponse();
      });
      await resolveEndpoint({ apiKey: API_KEY });
      const second = await resolveEndpoint({ apiKey: API_KEY });
      assert.equal(callCount, 1, "deploy API should be called exactly once");
      assert.equal(second.url, PER_TENANT_URL);
      assert.equal(second.source, "cache");
    });

    it("re-provisions when API key changes (fingerprint mismatch)", async () => {
      let callCount = 0;
      setFetch(async () => {
        callCount++;
        return successResponse();
      });
      await resolveEndpoint({ apiKey: API_KEY });
      const rotated = await resolveEndpoint({ apiKey: "KEY_different_key" });
      assert.equal(callCount, 2);
      assert.equal(rotated.source, "provisioned");
    });
  });

  describe("reset", () => {
    it("--reset flag clears cache and re-provisions", async () => {
      let callCount = 0;
      setFetch(async () => {
        callCount++;
        return successResponse();
      });
      await resolveEndpoint({ apiKey: API_KEY });
      const reset = await resolveEndpoint({ apiKey: API_KEY, reset: true });
      assert.equal(callCount, 2);
      assert.equal(reset.source, "provisioned");
    });

    it("TELNYX_MCP_RESET env var clears cache", async () => {
      let callCount = 0;
      setFetch(async () => {
        callCount++;
        return successResponse();
      });
      await resolveEndpoint({ apiKey: API_KEY });
      process.env.TELNYX_MCP_RESET = "1";
      const reset = await resolveEndpoint({ apiKey: API_KEY });
      assert.equal(callCount, 2);
      assert.equal(reset.source, "provisioned");
    });
  });

  describe("fallback paths", () => {
    it("404 falls back to shared URL, no cache write", async () => {
      setFetch(async () => new Response("Not Found", { status: 404 }));
      const { url, source } = await resolveEndpoint({ apiKey: API_KEY });
      assert.equal(url, SHARED_MCP_URL);
      assert.equal(source, "fallback");
      await assert.rejects(fs.access(cacheFile()));
    });

    it("500 falls back to shared URL, no cache write", async () => {
      setFetch(async () => new Response("Internal Server Error", { status: 500 }));
      const { url, source } = await resolveEndpoint({ apiKey: API_KEY });
      assert.equal(url, SHARED_MCP_URL);
      assert.equal(source, "fallback");
      await assert.rejects(fs.access(cacheFile()));
    });

    it("network error falls back to shared URL", async () => {
      setFetch(async () => {
        throw new TypeError("fetch failed");
      });
      const { url, source } = await resolveEndpoint({ apiKey: API_KEY });
      assert.equal(url, SHARED_MCP_URL);
      assert.equal(source, "fallback");
    });

    it("aborted fetch falls back to shared URL", async () => {
      setFetch(async () => {
        throw new DOMException("aborted", "AbortError");
      });
      const { url, source } = await resolveEndpoint({ apiKey: API_KEY });
      assert.equal(url, SHARED_MCP_URL);
      assert.equal(source, "fallback");
    });
  });

  describe("request shape", () => {
    it("sends Bearer auth and JSON body to deploy endpoint", async () => {
      let captured: { url: string; init: RequestInit } | null = null;
      setFetch(async (input, init) => {
        captured = { url: String(input), init: init! };
        return successResponse();
      });
      await resolveEndpoint({ apiKey: API_KEY });
      assert.ok(captured, "fetch should have been called");
      assert.equal(captured!.url, "https://api.telnyx.com/v2/compute/mcp/deploy");
      assert.equal(captured!.init.method, "POST");
      const headers = captured!.init.headers as Record<string, string>;
      assert.equal(headers.Authorization, `Bearer ${API_KEY}`);
      assert.equal(headers["Content-Type"], "application/json");
      const body = JSON.parse(String(captured!.init.body));
      assert.equal(body.name, "default-mcp");
    });
  });
});
