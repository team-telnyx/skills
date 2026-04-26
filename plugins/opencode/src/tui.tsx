/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule, TuiPluginApi } from "@opencode-ai/plugin/tui"
import { loadEnabledModels, persistEnabledModels } from "./models-config"
import {
  PROVIDER_ID,
  apiKey,
  buildProviderConfig,
  fetchHostedModels,
  providerModels,
} from "./shared"

function buildDialogOptions(
  models: ReadonlyArray<{ id: string; name: string; context: number; vision: boolean }>,
  enabled: Set<string>,
) {
  return models.map((model) => ({
    title: model.name,
    value: model.id,
    category: "Telnyx",
    footer: enabled.has(model.id) ? "ON" : "OFF",
  }))
}

async function openManager(api: TuiPluginApi): Promise<void> {
  const key = await apiKey()
  if (!key) {
    api.ui.toast({ title: "Telnyx", message: "No API key found. Run opencode auth login --provider telnyx" })
    return
  }

  const models = await fetchHostedModels(key)
  if (models.length === 0) {
    api.ui.toast({ title: "Telnyx", message: "No Telnyx-hosted models found." })
    return
  }

  const DialogSelect = api.ui.DialogSelect

  // Re-render the dialog in-place after each toggle instead of recursing.
  // This avoids unbounded stack growth from the previous recursive pattern.
  async function renderDialog(): Promise<void> {
    const enabled = new Set(await loadEnabledModels())
    const options = buildDialogOptions(models, enabled)

    api.ui.dialog.replace(() => (
      <DialogSelect<string>
        title={`Telnyx Models (${enabled.size} enabled)`}
        placeholder="Search models..."
        options={options}
        current={options[0]?.value}
        onSelect={async (option) => {
          const next = new Set(await loadEnabledModels())
          if (next.has(option.value)) next.delete(option.value)
          else next.add(option.value)
          const persisted = [...next].sort((left, right) => left.localeCompare(right))
          const modelsMap = providerModels(models, next)
          try {
            await api.client.config.update({
              config: {
                provider: {
                  [PROVIDER_ID]: buildProviderConfig(key, modelsMap),
                },
              },
            })
          } catch (error) {
            console.error("[telnyx] failed to update config after toggling model:", error)
            api.ui.toast({ title: "Telnyx", message: `Failed to update ${option.title}` })
            return
          }
          await persistEnabledModels(persisted)
          api.ui.toast({
            title: "Telnyx",
            message: `${next.has(option.value) ? "Enabled" : "Disabled"} ${option.title}`,
          })
          // Re-render the dialog with updated state instead of recursing.
          void renderDialog()
        }}
      />
    ))
    api.ui.dialog.setSize("large")
  }

  void renderDialog()
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
