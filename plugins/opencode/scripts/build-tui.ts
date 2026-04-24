import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, "..")
const outFile = resolve(rootDir, "dist", "tui.js")

mkdirSync(dirname(outFile), { recursive: true })

const result = await Bun.build({
  entrypoints: [resolve(rootDir, "src", "tui.tsx")],
  outdir: resolve(rootDir, "dist"),
  naming: {
    entry: "tui.js",
  },
  target: "bun",
  format: "esm",
  sourcemap: "linked",
  external: ["@opencode-ai/plugin", "@opentui/core", "@opentui/solid", "solid-js"],
  plugins: [createSolidTransformPlugin()],
})

if (!result.success) {
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}
