import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(__dirname, "..")
const ARTIFACTS_DIR = join(ROOT_DIR, "test", ".artifacts")
const MODELS_URL = "https://api.telnyx.com/v2/ai/models"
const PROVIDER_ID = "telnyx"
const TELNYX_OWNER = "telnyx"
const TEXT_TASKS = new Set(["text-generation", "text generation"])
const SIMPLE_TIMEOUT_MS = 90_000
const TOOL_TIMEOUT_MS = 120_000
const INVALID_TOOL_ARGS_PATTERN = /The .* tool was called with invalid arguments:/i
const ANSI_ESCAPE_PATTERN = new RegExp("\\u001B\\[[0-9;]*m", "g")

type JsonObject = Record<string, unknown>

type ProbeName = "simple" | "tool"
type ProbeStatus = "pass" | "fail" | "timeout" | "skipped"

interface ModelDescriptor {
  id: string
  providerModel: string
  context: number | undefined
  vision: boolean
  ownedBy: string | undefined
  organization: string | undefined
  recommendedForAssistants: boolean
  requiresExternalKey: boolean
}

interface ProbeResult {
  name: ProbeName
  status: ProbeStatus
  durationMs: number
  exitCode: number | null
  note: string
  outputPath: string
}

interface ModelResult {
  modelId: string
  providerModel: string
  context: number | undefined
  vision: boolean
  simple: ProbeResult
  tool: ProbeResult
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null
}

function isTelnyxHostedModel(model: JsonObject): boolean {
  return typeof model.owned_by === "string" && model.owned_by.toLowerCase() === TELNYX_OWNER
}

function shouldIncludeExternalModels(): boolean {
  const value = process.env.TELNYX_TEST_INCLUDE_EXTERNAL?.trim().toLowerCase()
  return value === "1" || value === "true" || value === "yes"
}

function loadDotEnvIfNeeded(): void {
  if (process.env.TELNYX_API_KEY?.trim()) return

  const envPath = join(ROOT_DIR, ".env")
  if (!existsSync(envPath)) return

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const normalized = line.startsWith("export ") ? line.slice(7) : line
    const separator = normalized.indexOf("=")
    if (separator <= 0) continue

    const key = normalized.slice(0, separator).trim()
    let value = normalized.slice(separator + 1).trim()
    if (!key || process.env[key] !== undefined) continue

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    process.env[key] = value
  }
}

function requireTelnyxApiKey(): string {
  loadDotEnvIfNeeded()
  const key = process.env.TELNYX_API_KEY?.trim()
  if (!key) {
    throw new Error("Missing TELNYX_API_KEY. Set it in the environment or repo-root .env before running npm test.")
  }
  return key
}

function ensureOpencodeInstalled(): void {
  const result = spawnSync("opencode", ["--version"], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    env: process.env,
  })

  if (result.error || result.status !== 0) {
    throw new Error("`opencode` is required on PATH to run the live model harness.")
  }
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_")
}

function reverse(value: string): string {
  return [...value].reverse().join("")
}

function artifactPath(modelId: string, probe: ProbeName): string {
  return join(ARTIFACTS_DIR, `${sanitizeFileName(modelId)}.${probe}.log`)
}

function writeProbeOutput(path: string, content: string): void {
  mkdirSync(ARTIFACTS_DIR, { recursive: true })
  writeFileSync(path, content)
}

function filterModels(models: ModelDescriptor[]): ModelDescriptor[] {
  let filtered = models

  const match = process.env.TELNYX_TEST_MODEL_MATCH?.trim()
  if (match) {
    filtered = filtered.filter((model) => model.id.includes(match))
  }

  const limitRaw = process.env.TELNYX_TEST_LIMIT?.trim()
  if (limitRaw) {
    const limit = Number.parseInt(limitRaw, 10)
    if (!Number.isNaN(limit) && limit > 0) filtered = filtered.slice(0, limit)
  }

  return filtered
}

async function fetchModels(apiKey: string): Promise<ModelDescriptor[]> {
  const response = await fetch(MODELS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch Telnyx models: ${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as unknown
  const data = isObject(payload) && Array.isArray(payload.data) ? payload.data : []

  return data.flatMap((item) => {
    if (!isObject(item)) return []

    const id = typeof item.id === "string" ? item.id : undefined
    const task = typeof item.task === "string" ? item.task : undefined
    const context = typeof item.context_length === "number" ? item.context_length : undefined
    const vision = item.is_vision_supported === true
    const ownedBy = typeof item.owned_by === "string" ? item.owned_by : undefined
    const organization = typeof item.organization === "string" ? item.organization : undefined
    const recommendedForAssistants = item.recommended_for_assistants === true

    if (!id || !task) return []
    if (!TEXT_TASKS.has(task)) return []

    return [{
      id,
      providerModel: `${PROVIDER_ID}/${id}`,
      context,
      vision,
      ownedBy,
      organization,
      recommendedForAssistants,
      requiresExternalKey: !isTelnyxHostedModel(item),
    }]
  }).sort((left, right) => left.id.localeCompare(right.id))
}

function buildArgs(model: string, prompt: string): string[] {
  const args = [
    "run",
    "--model",
    model,
    "--dir",
    ROOT_DIR,
    "--dangerously-skip-permissions",
  ]

  const agent = process.env.TELNYX_TEST_AGENT?.trim()
  if (agent) args.push("--agent", agent)

  const variant = process.env.TELNYX_TEST_VARIANT?.trim()
  if (variant) args.push("--variant", variant)

  args.push(prompt)
  return args
}

function runProbe(model: ModelDescriptor, probe: ProbeName, prompt: string, expectedText: string, timeout: number): ProbeResult {
  const outputPath = artifactPath(model.id, probe)
  const startedAt = Date.now()
  const result = spawnSync("opencode", buildArgs(model.providerModel, prompt), {
    cwd: ROOT_DIR,
    encoding: "utf8",
    timeout,
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      CI: process.env.CI ?? "1",
    },
  })

  const durationMs = Date.now() - startedAt
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n--- STDERR ---\n")
  writeProbeOutput(outputPath, output)

  if (result.error?.name === "Error" && "code" in result.error && result.error.code === "ETIMEDOUT") {
    return {
      name: probe,
      status: "timeout",
      durationMs,
      exitCode: result.status,
      note: `timed out after ${timeout}ms`,
      outputPath: relative(ROOT_DIR, outputPath),
    }
  }

  if (INVALID_TOOL_ARGS_PATTERN.test(output)) {
    return {
      name: probe,
      status: "fail",
      durationMs,
      exitCode: result.status,
      note: "tool schema validation error",
      outputPath: relative(ROOT_DIR, outputPath),
    }
  }

  if (result.error) {
    return {
      name: probe,
      status: "fail",
      durationMs,
      exitCode: result.status,
      note: result.error.message,
      outputPath: relative(ROOT_DIR, outputPath),
    }
  }

  if (result.status !== 0) {
    return {
      name: probe,
      status: "fail",
      durationMs,
      exitCode: result.status,
      note: extractFailureNote(output, result.status) ?? `opencode exited with status ${result.status}`,
      outputPath: relative(ROOT_DIR, outputPath),
    }
  }

  const failureNote = extractFailureNote(output, result.status)
  if (failureNote) {
    return {
      name: probe,
      status: "fail",
      durationMs,
      exitCode: result.status,
      note: failureNote,
      outputPath: relative(ROOT_DIR, outputPath),
    }
  }

  if (!output.includes(expectedText)) {
    return {
      name: probe,
      status: "fail",
      durationMs,
      exitCode: result.status,
      note: `expected text not found: ${expectedText}`,
      outputPath: relative(ROOT_DIR, outputPath),
    }
  }

  return {
    name: probe,
    status: "pass",
    durationMs,
    exitCode: result.status,
    note: "ok",
    outputPath: relative(ROOT_DIR, outputPath),
  }
}

function skippedProbe(name: ProbeName, note: string): ProbeResult {
  return {
    name,
    status: "skipped",
    durationMs: 0,
    exitCode: null,
    note,
    outputPath: "",
  }
}

function formatStatus(result: ProbeResult): string {
  const label = result.status.toUpperCase().padEnd(7, " ")
  return `${label} ${result.note}`
}

function extractFailureNote(output: string, exitCode: number | null): string | undefined {
  const detailMatch = output.match(/"detail":\s*"([^"\\]*(?:\\.[^"\\]*)*)"/)
  if (detailMatch) return detailMatch[1].replaceAll('\\"', '"')

  const titleMatch = output.match(/"title":\s*"([^"]+)"/)
  if (titleMatch) return titleMatch[1]

  const errorLine = output.split(/\r?\n/).find((line) => line.includes("Error:"))
  if (errorLine) return errorLine.replace(ANSI_ESCAPE_PATTERN, "").trim()

  if (exitCode !== null && exitCode !== 0) return `opencode exited with status ${exitCode}`
  return undefined
}

function writeSummary(results: ModelResult[], externalModels: ModelDescriptor[], includeExternalModels: boolean): string {
  const summaryPath = join(ARTIFACTS_DIR, "results.json")
  const payload = {
    generatedAt: new Date().toISOString(),
    rootDir: ROOT_DIR,
    includeExternalModels,
    externalKeyModels: externalModels.map((model) => ({
      modelId: model.id,
      providerModel: model.providerModel,
      ownedBy: model.ownedBy,
      organization: model.organization,
      recommendedForAssistants: model.recommendedForAssistants,
    })),
    totalModels: results.length,
    totals: {
      simplePass: results.filter((result) => result.simple.status === "pass").length,
      toolPass: results.filter((result) => result.tool.status === "pass").length,
      skipped: results.filter((result) => result.simple.status === "skipped" || result.tool.status === "skipped").length,
      failures: results.filter((result) => [result.simple.status, result.tool.status].some((status) => status === "fail" || status === "timeout")).length,
    },
    results,
  }

  writeFileSync(summaryPath, `${JSON.stringify(payload, null, 2)}\n`)
  return summaryPath
}

function printSummary(results: ModelResult[], externalModels: ModelDescriptor[], includeExternalModels: boolean, summaryPath: string): void {
  console.log("")
  if (!includeExternalModels && externalModels.length > 0) {
    console.log("External-key models excluded by default")
    console.log("====================================")
    for (const model of externalModels) {
      console.log(`${model.providerModel} (owned_by=${model.ownedBy ?? "unknown"})`)
    }
    console.log("")
  }

  console.log("Model results")
  console.log("=============")

  for (const result of results) {
    console.log(result.providerModel)
    console.log(`  simple: ${formatStatus(result.simple)} (${result.simple.durationMs}ms)`)
    console.log(`  tool:   ${formatStatus(result.tool)} (${result.tool.durationMs}ms)`)
  }

  const simplePass = results.filter((result) => result.simple.status === "pass").length
  const toolPass = results.filter((result) => result.tool.status === "pass").length
  const skipped = results.filter((result) => result.simple.status === "skipped" || result.tool.status === "skipped").length

  console.log("")
  console.log(`Simple prompt pass rate: ${simplePass}/${results.length}`)
  console.log(`Tool prompt pass rate:   ${toolPass}/${results.length}`)
  console.log(`Skipped models:          ${skipped}`)
  console.log(`Summary JSON: ${relative(ROOT_DIR, summaryPath)}`)
}

async function main(): Promise<void> {
  mkdirSync(ARTIFACTS_DIR, { recursive: true })
  ensureOpencodeInstalled()
  const apiKey = requireTelnyxApiKey()
  const allModels = await fetchModels(apiKey)
  const includeExternalModels = shouldIncludeExternalModels()
  const externalModels = allModels.filter((model) => model.requiresExternalKey)
  const models = filterModels(allModels.filter((model) => includeExternalModels || !model.requiresExternalKey))

  if (models.length === 0) {
    throw new Error("No Telnyx models matched the current filters.")
  }

  const toolToken = `tool-${randomUUID()}`
  const toolFilePath = join(ARTIFACTS_DIR, `tool-input-${process.pid}-${randomUUID()}.txt`)
  writeFileSync(toolFilePath, `${toolToken}\n`)

  const relativeToolPath = relative(ROOT_DIR, toolFilePath).split("\\").join("/")
  const simpleSource = `simple-${randomUUID().replaceAll("-", "")}`
  const simpleExpected = reverse(simpleSource)
  const simplePrompt = `Reverse this exact string and output nothing else: ${simpleSource}`
  const toolPrompt = [
    `Use the read tool to read the file ${relativeToolPath}.`,
    "Reply with exactly the full file contents and nothing else.",
    "Do not guess.",
  ].join(" ")

  const results: ModelResult[] = []

  try {
    for (const model of models) {
      console.log(`Running probes for ${model.providerModel}...`)
      if (model.requiresExternalKey) {
        const note = `requires external provider key (${model.ownedBy ?? "unknown"}) via api_key_ref/api_key and is filtered from plugin registration`
        results.push({
          modelId: model.id,
          providerModel: model.providerModel,
          context: model.context,
          vision: model.vision,
          simple: skippedProbe("simple", note),
          tool: skippedProbe("tool", note),
        })
        continue
      }

      const simple = runProbe(model, "simple", simplePrompt, simpleExpected, SIMPLE_TIMEOUT_MS)
      const tool = runProbe(model, "tool", toolPrompt, toolToken, TOOL_TIMEOUT_MS)
      results.push({
        modelId: model.id,
        providerModel: model.providerModel,
        context: model.context,
        vision: model.vision,
        simple,
        tool,
      })
    }
  } finally {
    rmSync(toolFilePath, { force: true })
  }

  const summaryPath = writeSummary(results, externalModels, includeExternalModels)
  printSummary(results, externalModels, includeExternalModels, summaryPath)

  const hasFailures = results.some((result) => [result.simple.status, result.tool.status].some((status) => status === "fail" || status === "timeout"))
  if (hasFailures) {
    process.exitCode = 1
  }
}

await main()
