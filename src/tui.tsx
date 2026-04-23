/** @jsxImportSource @opentui/solid */
import { readFileSync, renameSync, writeFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { TuiPlugin, TuiPluginModule, TuiPluginApi } from "@opencode-ai/plugin/tui"

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

function loadEnabledModels(): string[] {
  try {
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

function normalizeModel(model: JsonObject): { id: string; name: string; context: number; vision: boolean } | undefined {
  const id = typeof model.id === "string" ? model.id : undefined
  const task = typeof model.task === "string" ? model.task : undefined
  const context = typeof model.context_length === "number" ? model.context_length : undefined
  if (!id || !task || context === undefined) return undefined
  if (!TEXT_TASKS.has(task)) return undefined
  if (!isTelnyxHostedModel(model)) return undefined
  const name = id.includes("/") ? id.split("/").pop() ?? id : id
  const vision = model.is_vision_supported === true
  return { id, name, context, vision }
}

async function fetchHostedModels(key: string | undefined): Promise<Array<{ id: string; name: string; context: number; vision: boolean }>> {
  if (!key) return []
  try {
    const response = await fetch(MODELS_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return []
    const payload = (await response.json()) as unknown
    const data = isObject(payload) && Array.isArray(payload.data) ? payload.data : []
    return data
      .flatMap((item) => {
        if (!isObject(item)) return []
        const normalized = normalizeModel(item)
        return normalized ? [normalized] : []
      })
      .sort((left, right) => left.id.localeCompare(right.id))
  } catch {
    return []
  }
}

function providerModels(models: Array<{ id: string; name: string; context: number; vision: boolean }>, enabled: Set<string>) {
  return Object.fromEntries(
    models.flatMap((model) => {
      if (!enabled.has(model.id)) return []
      const entry: Record<string, unknown> = {
        name: model.name,
        limit: { context: model.context },
      }
      if (model.vision) {
        entry.attachment = true
        entry.modalities = { input: ["text", "image"], output: ["text"] }
      }
      return [[model.id, entry] as const]
    }),
  )
}

async function openManager(api: TuiPluginApi): Promise<void> {
  const key = apiKey()
  if (!key) {
    api.ui.toast({ title: "Telnyx", message: "No API key found. Run opencode auth login --provider telnyx" })
    return
  }

  const models = await fetchHostedModels(key)
  if (models.length === 0) {
    api.ui.toast({ title: "Telnyx", message: "No Telnyx-hosted models found." })
    return
  }

  const enabled = new Set(loadEnabledModels())
  const DialogSelect = api.ui.DialogSelect
  const options = models.map((model) => ({
    title: model.name,
    value: model.id,
    category: "Telnyx",
    footer: enabled.has(model.id) ? "ON" : "OFF",
  }))

  api.ui.dialog.replace(() => (
    <DialogSelect<string>
      title={`Telnyx Models (${enabled.size} enabled)`}
      placeholder="Search models..."
      options={options}
      current={options[0]?.value}
      onSelect={async (option) => {
        const next = new Set(loadEnabledModels())
        if (next.has(option.value)) next.delete(option.value)
        else next.add(option.value)
        const persisted = [...next].sort((left, right) => left.localeCompare(right))
        const modelsMap = providerModels(models, next)
        try {
          await api.client.config.update({
            config: {
              provider: {
                [PROVIDER_ID]: {
                  npm: "@ai-sdk/openai-compatible",
                  name: "Telnyx",
                  options: {
                    baseURL: OPENAI_BASE,
                    apiKey: key,
                  },
                  models: modelsMap,
                },
              },
            },
          })
        } catch {
          api.ui.toast({ title: "Telnyx", message: `Failed to update ${option.title}` })
          return
        }
        persistEnabledModels(persisted)
        api.ui.toast({
          title: "Telnyx",
          message: `${next.has(option.value) ? "Enabled" : "Disabled"} ${option.title}`,
        })
        await openManager(api)
      }}
    />
  ))
  api.ui.dialog.setSize("large")
}

const tui: TuiPlugin = async (api) => {
  api.command.register(() => [
    {
      title: "Manage Telnyx models",
      value: "telnyx.manage-models",
      description: "Enable or disable Telnyx-hosted models",
      category: "Telnyx",
      slash: {
        name: "telnyx",
        aliases: ["telnyx-models"],
      },
      onSelect() {
        void openManager(api)
      },
    },
  ])
}

export default {
  id: "telnyx",
  tui,
} satisfies TuiPluginModule & { id: string }
