import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { TelnyxCredentialSchema } from "./models-config"

export const PROVIDER_ID = "telnyx"
export const API_BASE = "https://api.telnyx.com/v2/ai"
export const OPENAI_BASE = `${API_BASE}/openai`
export const MODELS_URL = `${API_BASE}/models`
export const TEXT_TASKS = new Set(["text-generation", "text generation"])

export type JsonObject = Record<string, unknown>

// ---------------------------------------------------------------------------
// IO Dependencies (injectable for testing)
// ---------------------------------------------------------------------------

export interface Dependencies {
  readFile: (path: string) => Promise<string>
  fetchModels: (url: string, key: string | undefined) => Promise<JsonObject[]>
}

const defaultDeps: Dependencies = {
  readFile: (path) => readFile(path, "utf8"),
  fetchModels: async (url, key) => {
    if (!key) return []
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return []
    const payload = (await response.json()) as unknown
    const data = isObject(payload) && Array.isArray(payload.data) ? payload.data : []
    return data.filter((item): item is JsonObject => isObject(item))
  },
}

let deps: Dependencies = defaultDeps

/** Replace the dependency map (e.g. for testing). Returns the previous deps. */
export function replaceDependencies(next: Dependencies): Dependencies {
  const prev = deps
  deps = next
  return prev
}

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null
}

export function isTelnyxHostedModel(model: JsonObject): boolean {
  return typeof model.owned_by === "string" && model.owned_by.toLowerCase() === PROVIDER_ID
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function authFilePath(): string {
  const dataHome = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share")
  return join(dataHome, "opencode", "auth.json")
}

export async function storedApiKey(): Promise<string | undefined> {
  try {
    const auth = JSON.parse(await deps.readFile(authFilePath())) as unknown
    if (!isObject(auth)) return undefined
    const telnyx = auth[PROVIDER_ID]
    const parsed = TelnyxCredentialSchema.safeParse(telnyx)
    if (!parsed.success) {
      // Not a valid Telnyx credential entry — this is normal if the user
      // hasn't authenticated yet, so don't log at error level.
      return undefined
    }
    return parsed.data.key
  } catch (error) {
    console.error("[telnyx] failed to read auth file:", error)
    return undefined
  }
}

export async function apiKey(): Promise<string | undefined> {
  return process.env.TELNYX_API_KEY ?? await storedApiKey()
}

// ---------------------------------------------------------------------------
// Model normalization
// ---------------------------------------------------------------------------

export interface NormalizedModel {
  id: string
  name: string
  context: number
  vision: boolean
}

export function normalizeModel(model: JsonObject): NormalizedModel | undefined {
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

/** Convert a normalized model into the provider config entry expected by index.ts */
export function modelConfigEntry(model: NormalizedModel): [string, JsonObject] {
  const entry: JsonObject = {
    name: model.name,
    limit: { context: model.context },
  }
  if (model.vision) {
    entry.attachment = true
    entry.modalities = { input: ["text", "image"], output: ["text"] }
  }
  return [model.id, entry]
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/**
 * Fetch models from the Telnyx API and return only those matching the given
 * enabled-model IDs, in the provider-config format.
 */
export async function fetchModels(
  key: string | undefined,
  enabledModelIDs: readonly string[],
): Promise<Record<string, JsonObject>> {
  try {
    const items = await deps.fetchModels(MODELS_URL, key)
    const available = new Map<string, NormalizedModel>()

    for (const item of items) {
      const normalized = normalizeModel(item)
      if (normalized) available.set(normalized.id, normalized)
    }

    return Object.fromEntries(
      enabledModelIDs.flatMap((modelID) => {
        const normalized = available.get(modelID)
        return normalized ? [modelConfigEntry(normalized)] : []
      }),
    )
  } catch (error) {
    console.error("[telnyx] failed to fetch models:", error)
    return {}
  }
}

/**
 * Fetch all Telnyx-hosted text model IDs from the API.
 */
export async function fetchAllHostedModelIDs(key: string | undefined): Promise<string[]> {
  try {
    const items = await deps.fetchModels(MODELS_URL, key)
    const modelIDs: string[] = []

    for (const item of items) {
      const normalized = normalizeModel(item)
      if (normalized) modelIDs.push(normalized.id)
    }

    return modelIDs
  } catch (error) {
    console.error("[telnyx] failed to fetch hosted model IDs:", error)
    return []
  }
}

/**
 * Fetch all Telnyx-hosted models as normalized descriptors (used by TUI).
 */
export async function fetchHostedModels(
  key: string | undefined,
): Promise<NormalizedModel[]> {
  try {
    const items = await deps.fetchModels(MODELS_URL, key)
    return items
      .flatMap((item) => {
        const normalized = normalizeModel(item)
        return normalized ? [normalized] : []
      })
      .sort((left, right) => left.id.localeCompare(right.id))
  } catch (error) {
    console.error("[telnyx] failed to fetch hosted models:", error)
    return []
  }
}

// ---------------------------------------------------------------------------
// Provider config builder
// ---------------------------------------------------------------------------

/**
 * Build the provider config object shared by server and TUI entry points.
 * The `apiKey` field is omitted when `key` is undefined (server fallback).
 */
export function buildProviderConfig(
  key: string | undefined,
  models: Record<string, JsonObject>,
): Record<string, unknown> {
  return {
    npm: "@ai-sdk/openai-compatible",
    name: "Telnyx",
    options: {
      baseURL: OPENAI_BASE,
      ...(key ? { apiKey: key } : {}),
    },
    models,
  }
}

/**
 * Build the provider-models map from a list of normalized models and an
 * enabled set (used by the TUI model manager).
 */
export function providerModels(
  models: readonly NormalizedModel[],
  enabled: Set<string>,
): Record<string, JsonObject> {
  return Object.fromEntries(
    models.flatMap((model) => {
      if (!enabled.has(model.id)) return []
      return [modelConfigEntry(model)]
    }),
  )
}
