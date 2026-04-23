import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { Plugin } from "@opencode-ai/plugin"

const PROVIDER_ID = "telnyx"
const API_BASE = "https://api.telnyx.com/v2/ai"
const OPENAI_BASE = `${API_BASE}/openai`
const MODELS_URL = `${API_BASE}/models`
const MODELS_CONFIG_VERSION = 1
const TEXT_TASKS = new Set(["text-generation", "text generation"])
const DEFAULT_ENABLED_MODELS = [
  "moonshotai/Kimi-K2.6",
  "zai-org/GLM-5.1-FP8",
  "MiniMaxAI/MiniMax-M2.7",
] as const

type JsonObject = Record<string, unknown>
type ModelsConfigFile = {
  version: number
  enabledModels: string[]
}

type ModelSelectionPreset = "recommended" | "all" | "existing"

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null
}

function authFilePath(): string {
  const dataHome = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share")
  return join(dataHome, "opencode", "auth.json")
}

function configDirPath(): string {
  const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config")
  return join(configHome, "opencode")
}

function modelsConfigPath(): string {
  const override = process.env.OPENCODE_TELNYX_MODELS_PATH?.trim()
  return override && override.length > 0 ? override : join(configDirPath(), "telnyx-models.json")
}

function storedApiKey(): string | undefined {
  try {
    const auth = JSON.parse(readFileSync(authFilePath(), "utf8")) as unknown
    if (!isObject(auth)) return undefined
    const telnyx = auth[PROVIDER_ID]
    if (!isObject(telnyx) || telnyx.type !== "api") return undefined
    return typeof telnyx.key === "string" && telnyx.key.length > 0 ? telnyx.key : undefined
  } catch {
    return undefined
  }
}

function apiKey(): string | undefined {
  return process.env.TELNYX_API_KEY ?? storedApiKey()
}

function defaultModelsConfig(): ModelsConfigFile {
  return {
    version: MODELS_CONFIG_VERSION,
    enabledModels: [...DEFAULT_ENABLED_MODELS],
  }
}

function persistDefaultModelsConfigIfMissing(): void {
  const path = modelsConfigPath()
  if (existsSync(path)) return

  const payload = `${JSON.stringify(defaultModelsConfig(), null, 2)}\n`
  mkdirSync(dirname(path), { recursive: true })
  const tempPath = `${path}.tmp`
  writeFileSync(tempPath, payload, "utf8")
  renameSync(tempPath, path)
}

function loadEnabledModels(): string[] {
  try {
    persistDefaultModelsConfigIfMissing()
    const raw = JSON.parse(readFileSync(modelsConfigPath(), "utf8")) as unknown
    if (!isObject(raw)) return [...DEFAULT_ENABLED_MODELS]

    const version = raw.version
    const enabledModels = Array.isArray(raw.enabledModels)
      ? raw.enabledModels.filter((value): value is string => typeof value === "string" && value.length > 0)
      : []

    if (version !== MODELS_CONFIG_VERSION || enabledModels.length === 0) return [...DEFAULT_ENABLED_MODELS]
    return [...new Set(enabledModels)]
  } catch {
    return [...DEFAULT_ENABLED_MODELS]
  }
}

function persistEnabledModels(enabledModels: readonly string[]): void {
  const payload: ModelsConfigFile = {
    version: MODELS_CONFIG_VERSION,
    enabledModels: [...new Set(enabledModels)],
  }
  const path = modelsConfigPath()
  mkdirSync(dirname(path), { recursive: true })
  const tempPath = `${path}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
  renameSync(tempPath, path)
}

function isTelnyxHostedModel(model: JsonObject): boolean {
  return typeof model.owned_by === "string" && model.owned_by.toLowerCase() === "telnyx"
}

function modelConfig(model: JsonObject): [string, JsonObject] | undefined {
  const id = typeof model.id === "string" ? model.id : undefined
  const task = typeof model.task === "string" ? model.task : undefined
  const context = typeof model.context_length === "number" ? model.context_length : undefined
  if (!id || !task || context === undefined) return undefined
  if (!TEXT_TASKS.has(task)) return undefined
  if (!isTelnyxHostedModel(model)) return undefined

  const shortId = id.includes("/") ? id.split("/").pop() ?? id : id
  const vision = model.is_vision_supported === true

  return [
    id,
    {
      name: shortId,
      limit: { context },
      ...(vision
        ? {
            attachment: true,
            modalities: {
              input: ["text", "image"],
              output: ["text"],
            },
          }
        : {}),
    },
  ]
}

async function fetchModels(key: string | undefined, enabledModelIDs: readonly string[]): Promise<Record<string, JsonObject>> {
  if (!key) return {}

  try {
    const response = await fetch(MODELS_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return {}

    const payload = (await response.json()) as unknown
    const data = isObject(payload) && Array.isArray(payload.data) ? payload.data : []
    const availableModels = new Map<string, JsonObject>()

    for (const item of data) {
      if (!isObject(item)) continue
      const parsed = modelConfig(item)
      if (!parsed) continue
      availableModels.set(parsed[0], parsed[1])
    }

    return Object.fromEntries(enabledModelIDs.flatMap((modelID) => {
      const config = availableModels.get(modelID)
      return config ? [[modelID, config] as const] : []
    }))
  } catch {
    return {}
  }
}

async function fetchAllHostedModelIDs(key: string | undefined): Promise<string[]> {
  if (!key) return []

  try {
    const response = await fetch(MODELS_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return []

    const payload = (await response.json()) as unknown
    const data = isObject(payload) && Array.isArray(payload.data) ? payload.data : []
    const modelIDs: string[] = []

    for (const item of data) {
      if (!isObject(item)) continue
      const parsed = modelConfig(item)
      if (!parsed) continue
      modelIDs.push(parsed[0])
    }

    return modelIDs
  } catch {
    return []
  }
}

async function resolveEnabledModelsForPreset(key: string, preset: ModelSelectionPreset): Promise<string[]> {
  if (preset === "recommended") return [...DEFAULT_ENABLED_MODELS]
  if (preset === "existing") return loadEnabledModels()

  const allHostedModels = await fetchAllHostedModelIDs(key)
  return allHostedModels.length > 0 ? allHostedModels : loadEnabledModels()
}

const TelnyxAuthPlugin: Plugin = async () => {
  const key = apiKey()
  const enabledModels = loadEnabledModels()
  const models = await fetchModels(key, enabledModels)

  return {
    auth: {
      provider: PROVIDER_ID,
      methods: [{
        type: "api",
        label: "API Key",
        prompts: [
          {
            type: "text",
            key: "apiKey",
            message: "Enter your Telnyx API key",
            placeholder: "KEY_...",
            validate: (value) => value.trim().length === 0 ? "API key is required" : undefined,
          },
          {
            type: "select",
            key: "modelPreset",
            message: "Which Telnyx models should be enabled?",
            options: [
              {
                label: "Recommended 3 (default)",
                value: "recommended",
                hint: "Kimi-K2.6, GLM-5.1-FP8, MiniMax-M2.7",
              },
              {
                label: "All hosted Telnyx models",
                value: "all",
                hint: "Enable every currently available Telnyx-hosted text model",
              },
              {
                label: "Keep existing config",
                value: "existing",
                hint: "Leave ~/.config/opencode/telnyx-models.json unchanged",
              },
            ],
          },
        ],
        authorize: async (inputs) => {
          const providedKey = inputs?.apiKey?.trim()
          if (!providedKey) return { type: "failed" as const }

          const preset = inputs?.modelPreset === "all" || inputs?.modelPreset === "existing"
            ? inputs.modelPreset
            : "recommended"
          const nextEnabledModels = await resolveEnabledModelsForPreset(providedKey, preset)
          persistEnabledModels(nextEnabledModels)

          return {
            type: "success" as const,
            key: providedKey,
          }
        },
      }],
      loader: async (auth) => {
        const stored = await auth()
        return isObject(stored) && stored.type === "api" && typeof stored.key === "string"
          ? { apiKey: stored.key }
          : {}
      },
    },

    config: async (config: { provider?: Record<string, unknown> }) => {
      config.provider ??= {}
      config.provider[PROVIDER_ID] = {
        npm: "@ai-sdk/openai-compatible",
        name: "Telnyx",
        options: {
          baseURL: OPENAI_BASE,
          ...(key ? { apiKey: key } : {}),
        },
        models,
      }
    },

    "chat.params": async (input: { model?: { providerID?: string } }, output: { maxOutputTokens?: number }) => {
      if (input.model?.providerID === PROVIDER_ID) output.maxOutputTokens = undefined
    },
  }
}

export default TelnyxAuthPlugin
