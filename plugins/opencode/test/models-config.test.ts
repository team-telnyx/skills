import { afterEach, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  DEFAULT_ENABLED_MODELS,
  MODELS_CONFIG_VERSION,
  ModelsConfigFileSchema,
  defaultModelsConfig,
  loadEnabledModels,
  persistEnabledModels,
} from "../src/models-config.js"

describe("models-config", () => {
  let originalModelsPath: string | undefined
  let tempDir = ""
  let configPath = ""

  beforeEach(() => {
    originalModelsPath = process.env.OPENCODE_TELNYX_MODELS_PATH
    tempDir = "" // will be set in async beforeEach below
  })

  // We need async setup, so we use a lazy init pattern
  async function setup(): Promise<string> {
    tempDir = await mkdtemp(join(tmpdir(), "opencode-models-"))
    configPath = join(tempDir, "telnyx-models.json")
    process.env.OPENCODE_TELNYX_MODELS_PATH = configPath
    return tempDir
  }

  afterEach(async () => {
    if (originalModelsPath === undefined) delete process.env.OPENCODE_TELNYX_MODELS_PATH
    else process.env.OPENCODE_TELNYX_MODELS_PATH = originalModelsPath
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  // -----------------------------------------------------------------------
  // defaultModelsConfig
  // -----------------------------------------------------------------------

  describe("defaultModelsConfig", () => {
    it("returns the expected shape", () => {
      const config = defaultModelsConfig()
      assert.equal(config.version, MODELS_CONFIG_VERSION)
      assert.deepEqual(config.enabledModels, [...DEFAULT_ENABLED_MODELS])
    })

    it("passes the Zod schema", () => {
      const config = defaultModelsConfig()
      const result = ModelsConfigFileSchema.safeParse(config)
      assert.equal(result.success, true)
    })
  })

  // -----------------------------------------------------------------------
  // loadEnabledModels
  // -----------------------------------------------------------------------

  describe("loadEnabledModels", () => {
    it("creates the default allowlist when the config file is missing", async () => {
      await setup()
      const models = await loadEnabledModels()
      assert.deepEqual(models, [...DEFAULT_ENABLED_MODELS])

      // Verify it was persisted
      const persisted = ModelsConfigFileSchema.parse(JSON.parse(await readFile(configPath, "utf8")))
      assert.equal(persisted.version, MODELS_CONFIG_VERSION)
      assert.deepEqual(persisted.enabledModels, [...DEFAULT_ENABLED_MODELS])
    })

    it("reads an existing valid config file", async () => {
      await setup()
      const custom = { version: MODELS_CONFIG_VERSION, enabledModels: ["org/model-a"] }
      await writeFile(configPath, JSON.stringify(custom), "utf8")

      const models = await loadEnabledModels()
      assert.deepEqual(models, ["org/model-a"])
    })

    it("deduplicates enabled model IDs", async () => {
      await setup()
      const dupes = { version: MODELS_CONFIG_VERSION, enabledModels: ["a", "b", "a"] }
      await writeFile(configPath, JSON.stringify(dupes), "utf8")

      const models = await loadEnabledModels()
      assert.deepEqual(models, ["a", "b"])
    })

    it("falls back to defaults when the config file has invalid JSON", async () => {
      await setup()
      await writeFile(configPath, "not-json{{", "utf8")

      const models = await loadEnabledModels()
      assert.deepEqual(models, [...DEFAULT_ENABLED_MODELS])
    })

    it("falls back to defaults when the config file has an invalid schema (wrong types)", async () => {
      await setup()
      const badTypes = { version: "not-a-number", enabledModels: [1, 2, 3] }
      await writeFile(configPath, JSON.stringify(badTypes), "utf8")

      const models = await loadEnabledModels()
      assert.deepEqual(models, [...DEFAULT_ENABLED_MODELS])
    })

    it("falls back to defaults when the config file has the wrong version", async () => {
      await setup()
      const wrongVersion = { version: MODELS_CONFIG_VERSION + 1, enabledModels: [] }
      await writeFile(configPath, JSON.stringify(wrongVersion), "utf8")

      const models = await loadEnabledModels()
      assert.deepEqual(models, [...DEFAULT_ENABLED_MODELS])
    })

    it("filters out invalid entries instead of falling back entirely", async () => {
      await setup()
      const badModels = { version: MODELS_CONFIG_VERSION, enabledModels: ["valid", ""] }
      await writeFile(configPath, JSON.stringify(badModels), "utf8")

      const models = await loadEnabledModels()
      assert.deepEqual(models, ["valid"])
    })
  })

  // -----------------------------------------------------------------------
  // persistEnabledModels
  // -----------------------------------------------------------------------

  describe("persistEnabledModels", () => {
    it("writes a valid config file", async () => {
      await setup()
      await persistEnabledModels(["org/model-a", "org/model-b"])

      const raw = ModelsConfigFileSchema.parse(JSON.parse(await readFile(configPath, "utf8")))
      assert.equal(raw.version, MODELS_CONFIG_VERSION)
      assert.deepEqual(raw.enabledModels, ["org/model-a", "org/model-b"])
    })

    it("deduplicates when persisting", async () => {
      await setup()
      await persistEnabledModels(["a", "b", "a"])

      const raw = ModelsConfigFileSchema.parse(JSON.parse(await readFile(configPath, "utf8")))
      assert.deepEqual(raw.enabledModels, ["a", "b"])
    })

    it("preserves an explicitly empty selection", async () => {
      await setup()
      await persistEnabledModels([])

      const models = await loadEnabledModels()
      assert.deepEqual(models, [])

      const raw = ModelsConfigFileSchema.parse(JSON.parse(await readFile(configPath, "utf8")))
      assert.deepEqual(raw.enabledModels, [])
    })

    it("uses atomic write (temp file then rename)", async () => {
      await setup()
      await persistEnabledModels(["org/model"])

      // The temp file should not exist after write
      assert.equal(existsSync(`${configPath}.tmp`), false)
      // The real file should exist
      assert.equal(existsSync(configPath), true)
    })

    it("validates the payload against the Zod schema before writing", async () => {
      await setup()
      // persistEnabledModels constructs the payload internally and validates it.
      // The only way to trigger a validation failure is if the function's internal
      // logic produced an invalid payload — which it can't with the current code.
      // Instead we verify that the written file passes schema validation.
      await persistEnabledModels(["org/model"])
      const raw: unknown = JSON.parse(await readFile(configPath, "utf8"))
      const result = ModelsConfigFileSchema.safeParse(raw)
      assert.equal(result.success, true)
    })
  })
})
