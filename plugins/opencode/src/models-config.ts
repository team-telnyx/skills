import { existsSync } from "node:fs"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { z } from "zod"

const MODELS_CONFIG_FILE = "telnyx-models.json"

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

export const ModelsConfigFileSchema = z.object({
  version: z.number().int().nonnegative(),
  enabledModels: z.array(z.string().min(1)),
})

export const TelnyxCredentialSchema = z.object({
  type: z.literal("api"),
  key: z.string().min(1),
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModelsConfigFile = z.infer<typeof ModelsConfigFileSchema>

export const MODELS_CONFIG_VERSION = 1
export const DEFAULT_ENABLED_MODELS = [
  "moonshotai/Kimi-K2.6",
  "zai-org/GLM-5.1-FP8",
  "MiniMaxAI/MiniMax-M2.7",
] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function configDirPath(): string {
  const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config")
  return join(configHome, "opencode")
}

export function modelsConfigPath(): string {
  const override = process.env.OPENCODE_TELNYX_MODELS_PATH?.trim()
  return override && override.length > 0 ? override : join(configDirPath(), MODELS_CONFIG_FILE)
}

export function defaultModelsConfig(): ModelsConfigFile {
  return {
    version: MODELS_CONFIG_VERSION,
    enabledModels: [...DEFAULT_ENABLED_MODELS],
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export async function persistDefaultModelsConfigIfMissing(): Promise<void> {
  const path = modelsConfigPath()
  if (existsSync(path)) return

  const payload = `${JSON.stringify(defaultModelsConfig(), null, 2)}\n`
  await mkdir(dirname(path), { recursive: true })
  const tempPath = `${path}.tmp`
  await writeFile(tempPath, payload, "utf8")
  await rename(tempPath, path)
}

export async function loadEnabledModels(): Promise<string[]> {
  try {
    await persistDefaultModelsConfigIfMissing()
    const raw = JSON.parse(await readFile(modelsConfigPath(), "utf8")) as unknown
    const parsed = ModelsConfigFileSchema.safeParse(raw)
    if (!parsed.success) {
      console.error("[telnyx] invalid models config file, falling back to defaults:", parsed.error)
      return [...DEFAULT_ENABLED_MODELS]
    }

    if (parsed.data.version !== MODELS_CONFIG_VERSION) {
      console.error(`[telnyx] models config version ${parsed.data.version} != expected ${MODELS_CONFIG_VERSION}, falling back to defaults`)
      return [...DEFAULT_ENABLED_MODELS]
    }

    return [...new Set(parsed.data.enabledModels)]
  } catch (error) {
    console.error("[telnyx] failed to load models config, falling back to defaults:", error)
    return [...DEFAULT_ENABLED_MODELS]
  }
}

export async function persistEnabledModels(enabledModels: readonly string[]): Promise<void> {
  const payload: ModelsConfigFile = {
    version: MODELS_CONFIG_VERSION,
    enabledModels: [...new Set(enabledModels)],
  }
  // Validate before writing — guarantees we can always read back what we write.
  ModelsConfigFileSchema.parse(payload)
  const path = modelsConfigPath()
  await mkdir(dirname(path), { recursive: true })
  const tempPath = `${path}.tmp`
  await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
  await rename(tempPath, path)
}
