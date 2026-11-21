import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import sharp from "sharp"
import type { AiLogo } from "../data/catalog"
import { writeAtomic } from "./sync"

const packages = {
  "lobe-icons": { name: "@lobehub/icons-static-svg", version: "1.104.0" },
  "simple-icons": { name: "simple-icons", version: "16.15.0" },
} as const

type Source = keyof typeof packages
type Variant = "color" | "mono"
type Entry = [slug: string, name: string, kind: AiLogo["kind"], source: Source, sourceFile: string, variant: Variant]
type CatalogEntry = AiLogo & { source: Source; variant: Variant }

const entries: Entry[] = [
  ["ai21", "AI21", "company", "lobe-icons", "ai21.svg", "mono"],
  ["anthropic", "Anthropic", "company", "lobe-icons", "anthropic.svg", "mono"],
  ["baidu", "Baidu", "company", "lobe-icons", "baidu-color.svg", "color"],
  ["black-forest-labs", "Black Forest Labs", "company", "lobe-icons", "bfl.svg", "mono"],
  ["bytedance", "ByteDance (Doubao)", "company", "lobe-icons", "bytedance-color.svg", "color"],
  ["cerebras", "Cerebras", "company", "lobe-icons", "cerebras-color.svg", "color"],
  ["claude", "Claude", "company", "lobe-icons", "claude-color.svg", "color"],
  ["cohere", "Cohere", "company", "lobe-icons", "cohere-color.svg", "color"],
  ["deepseek", "DeepSeek", "company", "lobe-icons", "deepseek-color.svg", "color"],
  ["elevenlabs", "ElevenLabs", "company", "lobe-icons", "elevenlabs.svg", "mono"],
  ["fireworks", "Fireworks", "company", "lobe-icons", "fireworks-color.svg", "color"],
  ["deepmind", "Google DeepMind", "company", "lobe-icons", "deepmind-color.svg", "color"],
  ["gemini", "Google Gemini", "company", "lobe-icons", "gemini-color.svg", "color"],
  ["grok", "Grok", "company", "lobe-icons", "grok.svg", "mono"],
  ["groq", "Groq", "company", "lobe-icons", "groq.svg", "mono"],
  ["hailuo", "Hailuo", "company", "lobe-icons", "hailuo-color.svg", "color"],
  ["hugging-face", "Hugging Face", "company", "lobe-icons", "huggingface-color.svg", "color"],
  ["inflection", "Inflection", "company", "lobe-icons", "inflection.svg", "mono"],
  ["kling", "Kling", "company", "lobe-icons", "kling-color.svg", "color"],
  ["langchain", "LangChain", "company", "lobe-icons", "langchain-color.svg", "color"],
  ["llamaindex", "LlamaIndex", "company", "lobe-icons", "llamaindex-color.svg", "color"],
  ["luma", "Luma", "company", "lobe-icons", "luma-color.svg", "color"],
  ["meta", "Meta", "company", "lobe-icons", "meta-color.svg", "color"],
  ["microsoft-copilot", "Microsoft Copilot", "company", "lobe-icons", "copilot-color.svg", "color"],
  ["midjourney", "Midjourney", "company", "lobe-icons", "midjourney.svg", "mono"],
  ["minimax", "MiniMax", "company", "lobe-icons", "minimax-color.svg", "color"],
  ["mistral", "Mistral", "company", "lobe-icons", "mistral-color.svg", "color"],
  ["moonshot", "Moonshot (Kimi)", "company", "lobe-icons", "moonshot.svg", "mono"],
  ["nvidia", "NVIDIA", "company", "lobe-icons", "nvidia-color.svg", "color"],
  ["ollama", "Ollama", "company", "lobe-icons", "ollama.svg", "mono"],
  ["openai", "OpenAI", "company", "lobe-icons", "openai.svg", "mono"],
  ["openrouter", "OpenRouter", "company", "lobe-icons", "openrouter-color.svg", "color"],
  ["perplexity", "Perplexity", "company", "lobe-icons", "perplexity-color.svg", "color"],
  ["pika", "Pika", "company", "lobe-icons", "pika.svg", "mono"],
  ["qwen", "Qwen", "company", "lobe-icons", "qwen-color.svg", "color"],
  ["reka", "Reka", "company", "lobe-icons", "reka.svg", "mono"],
  ["runway", "Runway", "company", "lobe-icons", "runway.svg", "mono"],
  ["sambanova", "SambaNova", "company", "lobe-icons", "sambanova-color.svg", "color"],
  ["sora", "Sora", "company", "lobe-icons", "sora-color.svg", "color"],
  ["stability-ai", "Stability AI", "company", "lobe-icons", "stability-color.svg", "color"],
  ["suno", "Suno", "company", "lobe-icons", "suno.svg", "mono"],
  ["together-ai", "Together AI", "company", "lobe-icons", "together-color.svg", "color"],
  ["vercel", "Vercel", "company", "lobe-icons", "vercel.svg", "mono"],
  ["xai", "xAI", "company", "lobe-icons", "xai.svg", "mono"],
  ["zhipu", "Zhipu (Z.ai / GLM)", "company", "lobe-icons", "zhipu-color.svg", "color"],
  ["amp", "Amp", "harness", "lobe-icons", "amp-color.svg", "color"],
  ["antigravity", "Antigravity", "harness", "lobe-icons", "antigravity-color.svg", "color"],
  ["claude-code", "Claude Code", "harness", "lobe-icons", "claudecode-color.svg", "color"],
  ["cline", "Cline", "harness", "lobe-icons", "cline.svg", "mono"],
  ["codex", "Codex", "harness", "lobe-icons", "codex-color.svg", "color"],
  ["cursor", "Cursor", "harness", "lobe-icons", "cursor.svg", "mono"],
  ["devin", "Devin", "harness", "lobe-icons", "devin-color.svg", "color"],
  ["gemini-cli", "Gemini CLI", "harness", "lobe-icons", "geminicli-color.svg", "color"],
  ["github-copilot", "GitHub Copilot", "harness", "lobe-icons", "githubcopilot.svg", "mono"],
  ["goose", "Goose", "harness", "lobe-icons", "goose.svg", "mono"],
  ["hermes-agent", "Hermes Agent", "harness", "lobe-icons", "hermesagent.svg", "mono"],
  ["junie", "Junie", "harness", "lobe-icons", "junie-color.svg", "color"],
  ["kilo-code", "Kilo Code", "harness", "lobe-icons", "kilocode.svg", "mono"],
  ["kiro", "Kiro", "harness", "lobe-icons", "kiro-color.svg", "color"],
  ["lovable", "Lovable", "harness", "lobe-icons", "lovable-color.svg", "color"],
  ["manus", "Manus", "harness", "lobe-icons", "manus.svg", "mono"],
  ["openclaw", "OpenClaw", "harness", "lobe-icons", "openclaw-color.svg", "color"],
  ["opencode", "OpenCode", "harness", "lobe-icons", "opencode.svg", "mono"],
  ["openhands", "OpenHands", "harness", "lobe-icons", "openhands-color.svg", "color"],
  ["qoder", "Qoder", "harness", "lobe-icons", "qoder-color.svg", "color"],
  ["replit", "Replit", "harness", "lobe-icons", "replit-color.svg", "color"],
  ["roo-code", "Roo Code", "harness", "lobe-icons", "roocode.svg", "mono"],
  ["trae", "Trae", "harness", "lobe-icons", "trae-color.svg", "color"],
  ["v0", "v0", "harness", "lobe-icons", "v0.svg", "mono"],
  ["warp", "Warp", "harness", "simple-icons", "warp.svg", "mono"],
  ["windsurf", "Windsurf", "harness", "lobe-icons", "windsurf.svg", "mono"],
  ["zed", "Zed", "harness", "simple-icons", "zedindustries.svg", "mono"],
]

export function normalizeSvg(svg: string, brandHex?: string): string {
  if (/<\s*(?:[\w.-]+:)?(?:script|foreignObject|style|!DOCTYPE|!ENTITY)\b|\son[a-z]+\s*=/i.test(svg) ||
      /\s(?:[\w.-]+:)?(?:href|src)\s*=\s*["'](?!#)|\burl\((?!\s*["']?#)/i.test(svg)) {
    throw new Error("SVG contains active content or an external reference")
  }
  if (brandHex !== undefined && !/^[\da-f]{6}$/i.test(brandHex)) throw new Error("Invalid brand color")

  const opening = /^\s*<svg\b([^>]*)>/.exec(svg)
  if (!opening) throw new Error("Missing SVG root")
  const viewBox = /\sviewBox\s*=\s*(["'])(.*?)\1/.exec(opening[1])
  const dimensions = viewBox?.[2].trim().split(/[\s,]+/).map(Number)
  if (dimensions?.length !== 4 || !dimensions.every(Number.isFinite) || dimensions[2] <= 0 || dimensions[3] <= 0) {
    throw new Error("Invalid SVG viewBox")
  }
  const [, , viewWidth, viewHeight] = dimensions
  const scale = 512 / Math.max(viewWidth, viewHeight)
  const width = Math.max(1, Math.round(viewWidth * scale))
  const height = Math.max(1, Math.round(viewHeight * scale))

  const color = brandHex ? `#${brandHex}` : "#111111"
  let attributes = opening[1]
    .replace(/\s(?:width|height)\s*=\s*(["']).*?\1/g, "")
    .replace(/\sstyle\s*=\s*(["'])flex:none;line-height:1\1/g, "")
  if (brandHex) {
    attributes = attributes.replace(/\sfill\s*=\s*(["']).*?\1/g, "") + ` fill="${color}"`
  }
  return (`<svg${attributes} width="${width}" height="${height}">` + svg.slice(opening[0].length))
    .replace(/currentColor/gi, color)
}

function run(command: string[], cwd: string): string {
  const result = Bun.spawnSync(command, { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  if (result.exitCode !== 0) {
    throw new Error(`${command[0]} failed: ${result.stderr.toString().trim()}`)
  }
  return result.stdout.toString()
}

async function unpackSource(source: Source, temp: string): Promise<string> {
  const { name, version } = packages[source]
  const archiveName = `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`
  const localArchives = process.env.AI_LOGO_TARBALL_DIR
  const spec = localArchives ? resolve(localArchives, archiveName) : `${name}@${version}`
  const [{ filename }] = JSON.parse(run([
    "npm", "pack", "--json", "--ignore-scripts", "--registry=https://registry.npmjs.org",
    "--userconfig=/dev/null", `--globalconfig=${join(temp, "npm-global.conf")}`,
    `--cache=${join(temp, "npm-cache")}`, spec,
  ], temp)) as { filename: string }[]
  const directory = join(temp, source)
  await mkdir(directory)
  run(["tar", "-xf", join(temp, filename), "-C", directory], temp)
  const root = join(directory, "package")
  const manifest = await Bun.file(join(root, "package.json")).json()
  if (manifest.name !== name || manifest.version !== version) {
    throw new Error(`Expected ${name}@${version} in ${filename}`)
  }
  return root
}

async function syncAi() {
  const root = resolve(import.meta.dir, "..")
  const temp = await mkdtemp(join(tmpdir(), "sync-ai-"))
  try {
    const lobe = await unpackSource("lobe-icons", temp)
    const simple = await unpackSource("simple-icons", temp)
    const dirs = { "lobe-icons": lobe, "simple-icons": simple }
    const colors: { slug: string; hex: string }[] = await Bun.file(join(simple, "data", "simple-icons.json")).json()
    const hexBySlug = new Map(colors.map(({ slug, hex }) => [slug, hex]))
    const logos = []
    for (const [slug, name, kind, source, sourceFile, variant] of entries) {
      const input = await readFile(join(dirs[source], "icons", sourceFile), "utf8")
      const hex = source === "simple-icons" ? hexBySlug.get(sourceFile.slice(0, -4)) : undefined
      if (source === "simple-icons" && !hex) throw new Error(`Missing brand color for ${sourceFile}`)
      const svg = normalizeSvg(input, hex)
      const webp = await sharp(Buffer.from(svg))
        .resize(96, 96, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 80 })
        .toBuffer()
      const row: CatalogEntry = { slug, name, kind, file: `${slug}.svg`, sm: `${slug}.webp`, source, variant }
      logos.push({ row, svg, webp })
    }
    logos.sort(({ row: a }, { row: b }) => a.kind.localeCompare(b.kind, "en") || a.name.localeCompare(b.name, "en"))
    for (const { row, svg, webp } of logos) {
      await writeAtomic(join(root, "icons", "ai", row.file), svg)
      await writeAtomic(join(root, "icons", "sm", "ai", row.sm), webp)
    }
    const rows = logos.map(({ row }) => `  ${JSON.stringify(row)}`)
    await writeAtomic(join(root, "data", "ai.json"), `[\n${rows.join(",\n")}\n]\n`)
    const companies = logos.filter(({ row }) => row.kind === "company").length
    console.log(`AI archive: ${logos.length} SVGs and ${logos.length} WebPs (${companies} companies, ${logos.length - companies} harnesses).`)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
}

if (import.meta.main) await syncAi()
