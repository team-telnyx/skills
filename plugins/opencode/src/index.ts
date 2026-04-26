import type { Plugin } from "@opencode-ai/plugin"
import { DEFAULT_ENABLED_MODELS, loadEnabledModels, persistEnabledModels } from "./models-config"
import {
  PROVIDER_ID,
  apiKey,
  buildProviderConfig,
  fetchModels,
  fetchAllHostedModelIDs,
  isObject,
} from "./shared"

type ModelSelectionPreset = "recommended" | "all" | "existing"

async function resolveEnabledModelsForPreset(key: string, preset: ModelSelectionPreset): Promise<string[]> {
  if (preset === "recommended") return [...DEFAULT_ENABLED_MODELS]
  if (preset === "existing") return await loadEnabledModels()

  const allHostedModels = await fetchAllHostedModelIDs(key)
  return allHostedModels.length > 0 ? allHostedModels : await loadEnabledModels()
}

const TelnyxAuthPlugin: Plugin = async () => {
  const key = await apiKey()
  const enabledModels = await loadEnabledModels()
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
          await persistEnabledModels(nextEnabledModels)

          return {
            type: "success" as const,
            key: providedKey,
          }
        },
      }],
      loader: async (auth) => {
        const stored = await auth()
        if (isObject(stored) && stored.type === "api" && typeof stored.key === "string") {
          return { apiKey: stored.key }
        }
        return {}
      },
    },

    config: async (config: { provider?: Record<string, unknown> }) => {
      config.provider ??= {}
      config.provider[PROVIDER_ID] = buildProviderConfig(key, models)
    },

    "chat.params": async (input: { model?: { providerID?: string } }, output: { maxOutputTokens?: number }) => {
      if (input.model?.providerID === PROVIDER_ID) output.maxOutputTokens = undefined
    },
  }
}

export default TelnyxAuthPlugin
