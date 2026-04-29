import { afterEach, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  DEFAULT_ENABLED_MODELS,
  MODELS_CONFIG_VERSION,
  loadEnabledModels,
  persistEnabledModels,
} from "../src/models-config.js"

describe("models-config", () => {
  let originalModelsPath: string | undefined
  let tempDir = ""
  let configPath = ""

  beforeEach(() => {
    originalModelsPath = process.env.OPENCODE_TELNYX_MODELS_PATH
    tempDir = mkdtempSync(join(tmpdir(), "opencode-models-"))
    configPath = join(tempDir, "telnyx-models.json")
    process.env.OPENCODE_TELNYX_MODELS_PATH = configPath
  })

  afterEach(() => {
    if (originalModelsPath === undefined) delete process.env.OPENCODE_TELNYX_MODELS_PATH
    else process.env.OPENCODE_TELNYX_MODELS_PATH = originalModelsPath
    rmSync(tempDir, { recursive: true, force: true })
  })

  it("creates the default allowlist when the config file is missing", () => {
    assert.deepEqual(loadEnabledModels(), [...DEFAULT_ENABLED_MODELS])

    const persisted = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>
    assert.equal(persisted.version, MODELS_CONFIG_VERSION)
    assert.deepEqual(persisted.enabledModels, [...DEFAULT_ENABLED_MODELS])
  })

  it("preserves an explicitly empty selection", () => {
    persistEnabledModels([])

    assert.deepEqual(loadEnabledModels(), [])

    const persisted = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>
    assert.deepEqual(persisted.enabledModels, [])
  })

  it("falls back to defaults when the saved config version is invalid", () => {
    writeFileSync(configPath, JSON.stringify({ version: MODELS_CONFIG_VERSION + 1, enabledModels: [] }), "utf8")

    assert.deepEqual(loadEnabledModels(), [...DEFAULT_ENABLED_MODELS])
  })
})
