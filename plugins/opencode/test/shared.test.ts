import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  isObject,
  isTelnyxHostedModel,
  normalizeModel,
  modelConfigEntry,
  buildProviderConfig,
  replaceDependencies,
} from "../src/shared.js"
import type { Dependencies, JsonObject, NormalizedModel } from "../src/shared.js"

// ---------------------------------------------------------------------------
// isObject
// ---------------------------------------------------------------------------

describe("isObject", () => {
  it("returns true for plain objects", () => {
    assert.equal(isObject({}), true)
    assert.equal(isObject({ a: 1 }), true)
  })

  it("returns false for null", () => {
    assert.equal(isObject(null), false)
  })

  it("returns true for arrays (typeof array === 'object')", () => {
    // Arrays pass typeof check — this is intentional; callers filter with Array.isArray
    assert.equal(isObject([]), true)
    assert.equal(isObject([1, 2]), true)
  })

  it("returns false for primitives", () => {
    assert.equal(isObject("string"), false)
    assert.equal(isObject(42), false)
    assert.equal(isObject(true), false)
    assert.equal(isObject(undefined), false)
  })
})

// ---------------------------------------------------------------------------
// isTelnyxHostedModel
// ---------------------------------------------------------------------------

describe("isTelnyxHostedModel", () => {
  it("returns true for a Telnyx-hosted model", () => {
    assert.equal(isTelnyxHostedModel({ id: "x", owned_by: "telnyx" }), true)
  })

  it("is case-insensitive on owned_by", () => {
    assert.equal(isTelnyxHostedModel({ id: "x", owned_by: "Telnyx" }), true)
    assert.equal(isTelnyxHostedModel({ id: "x", owned_by: "TELNYX" }), true)
  })

  it("returns false for a different owner", () => {
    assert.equal(isTelnyxHostedModel({ id: "x", owned_by: "openai" }), false)
  })

  it("returns false when owned_by is missing", () => {
    assert.equal(isTelnyxHostedModel({ id: "x" }), false)
  })

  it("returns false when owned_by is not a string", () => {
    assert.equal(isTelnyxHostedModel({ id: "x", owned_by: 42 }), false)
  })
})

// ---------------------------------------------------------------------------
// normalizeModel
// ---------------------------------------------------------------------------

describe("normalizeModel", () => {
  const validModel: JsonObject = {
    id: "org/model-name",
    task: "text-generation",
    context_length: 8192,
    owned_by: "telnyx",
    is_vision_supported: false,
  }

  it("normalizes a valid Telnyx-hosted text model", () => {
    const result = normalizeModel(validModel)
    assert.deepStrictEqual(result, {
      id: "org/model-name",
      name: "model-name",
      context: 8192,
      vision: false,
    })
  })

  it("returns undefined when id is missing", () => {
    const { id, ...noId } = validModel
    assert.equal(normalizeModel(noId as JsonObject), undefined)
  })

  it("returns undefined when task is missing", () => {
    const { task, ...noTask } = validModel
    assert.equal(normalizeModel(noTask as JsonObject), undefined)
  })

  it("returns undefined when context_length is missing", () => {
    const { context_length, ...noCtx } = validModel
    assert.equal(normalizeModel(noCtx as JsonObject), undefined)
  })

  it("returns undefined for a non-Telnyx hosted model", () => {
    assert.equal(normalizeModel({ ...validModel, owned_by: "other" }), undefined)
  })

  it("returns undefined for a non-text task", () => {
    assert.equal(normalizeModel({ ...validModel, task: "image-generation" }), undefined)
  })

  it("detects vision support", () => {
    const result = normalizeModel({ ...validModel, is_vision_supported: true })
    assert.equal(result?.vision, true)
  })

  it("uses the full id as name when there is no slash", () => {
    const result = normalizeModel({ ...validModel, id: "model-name" })
    assert.equal(result?.name, "model-name")
  })
})

// ---------------------------------------------------------------------------
// modelConfigEntry
// ---------------------------------------------------------------------------

describe("modelConfigEntry", () => {
  const baseModel: NormalizedModel = {
    id: "org/model",
    name: "model",
    context: 4096,
    vision: false,
  }

  it("builds an entry without vision", () => {
    const [id, entry] = modelConfigEntry(baseModel)
    assert.equal(id, "org/model")
    assert.equal(entry.name, "model")
    assert.deepStrictEqual(entry.limit, { context: 4096 })
    assert.equal(entry.attachment, undefined)
    assert.equal(entry.modalities, undefined)
  })

  it("builds an entry with vision", () => {
    const [id, entry] = modelConfigEntry({ ...baseModel, vision: true })
    assert.equal(id, "org/model")
    assert.equal(entry.attachment, true)
    assert.deepStrictEqual(entry.modalities, { input: ["text", "image"], output: ["text"] })
  })
})

// ---------------------------------------------------------------------------
// buildProviderConfig
// ---------------------------------------------------------------------------

describe("buildProviderConfig", () => {
  it("includes apiKey when key is provided", () => {
    const config = buildProviderConfig("sk-test", {})
    assert.equal(config.npm, "@ai-sdk/openai-compatible")
    assert.equal(config.name, "Telnyx")
    const options = config.options as Record<string, unknown>
    assert.equal(options.apiKey, "sk-test")
    assert.equal(options.baseURL, "https://api.telnyx.com/v2/ai/openai")
  })

  it("omits apiKey when key is undefined", () => {
    const config = buildProviderConfig(undefined, {})
    const options = config.options as Record<string, unknown>
    assert.equal("apiKey" in options, false)
    assert.equal(options.baseURL, "https://api.telnyx.com/v2/ai/openai")
  })

  it("passes through the models map", () => {
    const models = { "org/model": { name: "model" } }
    const config = buildProviderConfig("k", models)
    assert.deepStrictEqual(config.models, models)
  })
})

// ---------------------------------------------------------------------------
// storedApiKey (via dependency injection)
// ---------------------------------------------------------------------------

describe("storedApiKey", () => {
  it("returns the key from a valid auth file", async () => {
    const { storedApiKey } = await import("../src/shared.js")
    const prev = replaceDependencies({
      readFile: async () => JSON.stringify({ telnyx: { type: "api", key: "KEY_123" } }),
      fetchModels: async () => [],
    })
    try {
      const key = await storedApiKey()
      assert.equal(key, "KEY_123")
    } finally {
      replaceDependencies(prev)
    }
  })

  it("returns undefined when auth file is missing", async () => {
    const { storedApiKey } = await import("../src/shared.js")
    const prev = replaceDependencies({
      readFile: async () => { throw new Error("ENOENT") },
      fetchModels: async () => [],
    })
    try {
      const key = await storedApiKey()
      assert.equal(key, undefined)
    } finally {
      replaceDependencies(prev)
    }
  })

  it("returns undefined when credential shape is wrong", async () => {
    const { storedApiKey } = await import("../src/shared.js")
    const prev = replaceDependencies({
      readFile: async () => JSON.stringify({ telnyx: { type: "wrong", key: "KEY_123" } }),
      fetchModels: async () => [],
    })
    try {
      const key = await storedApiKey()
      assert.equal(key, undefined)
    } finally {
      replaceDependencies(prev)
    }
  })
})
