import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileStem, type Coin, type Exchange, type Logo } from "../data/catalog"

const cdn = "https://logos.listingapis.com"
const cmcUrl = "https://s2.coinmarketcap.com/generated/search/quick_search.json"
const concurrency = 16
const unranked = Number.MAX_SAFE_INTEGER

type CoinMetadata = { id: number; symbol: string; name: string; slug: string; rank: number | null }
type CoinMap = Record<string, { url?: string; source: string }>
type Kind = "coins" | "exchanges"
type Failure = { key: string; stage: "original" | "sm"; reason: string }
type Job = { kind: Kind; key: string; logo: Logo }
type Get = (url: string) => Promise<Response>

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)
const byRank = (a: CoinMetadata, b: CoinMetadata) =>
  (a.rank ?? unranked) - (b.rank ?? unranked) || a.id - b.id
const prefixOf = (kind: Kind) => kind === "coins" ? "coin-logos" : "exchange-logos"

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T
}

async function writeAtomic(path: string, content: string | Uint8Array) {
  const temporary = `${path}.${process.pid}.sync-part`
  await mkdir(dirname(path), { recursive: true })
  await writeFile(temporary, content)
  await rename(temporary, path)
}

function writeJson(path: string, data: unknown) {
  return writeAtomic(path, JSON.stringify(data) + "\n")
}

async function publicGet(url: string) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20_000) })
    if (attempt === 2 || (response.status !== 429 && response.status < 500)) return response
    await response.body?.cancel()
    await Bun.sleep(500 * 2 ** attempt)
  }
}

async function fetchMetadata(get: Get): Promise<CoinMetadata[]> {
  const response = await get(cmcUrl)
  if (!response.ok) throw new Error(`CoinMarketCap HTTP ${response.status}`)
  const raw = await response.json()
  const rows = Array.isArray(raw) ? raw : raw?.data
  if (!Array.isArray(rows)) throw new Error("Unexpected CoinMarketCap quick-search format")

  const coins = new Map<number, CoinMetadata>()
  for (const row of rows) {
    const id = Number(row?.id)
    if (!Number.isSafeInteger(id) || id <= 0 ||
        ![row.symbol, row.name, row.slug].every(value => typeof value === "string" && value.trim())) continue
    const rank = Number(row.rank ?? row.cmc_rank)
    coins.set(id, {
      id, symbol: row.symbol.trim(), name: row.name.trim(), slug: row.slug.trim(),
      rank: Number.isSafeInteger(rank) && rank > 0 ? rank : null,
    })
  }
  if (!coins.size) throw new Error("CoinMarketCap returned no coin metadata")
  return [...coins.values()].sort(byRank)
}

async function loadMetadata(metadataFile: string, refresh: boolean, get: Get) {
  let refreshError: unknown
  if (refresh) {
    const metadata = await fetchMetadata(get).catch(error => {
      refreshError = error
    })
    if (metadata) {
      await writeJson(metadataFile, metadata)
      return metadata
    }
  }
  const snapshot = await readJson<CoinMetadata[] | { coins: CoinMetadata[] }>(metadataFile).catch(error => {
    if (error?.code !== "ENOENT") throw error
    return []
  })
  const saved = Array.isArray(snapshot) ? snapshot : snapshot.coins
  if (refresh) {
    console.warn(`CoinMarketCap snapshot unavailable: ${errorMessage(refreshError)}. Using ${saved.length} saved rows.`)
  }
  return saved
}

function originalFile(rawUrl: string, kind: Kind) {
  const url = new URL(rawUrl)
  const prefix = `/${prefixOf(kind)}/`
  const file = decodeURIComponent(url.pathname.slice(prefix.length))
  if (url.origin !== cdn || !url.pathname.startsWith(prefix) ||
      !/^[^/\\\u0000-\u001f]+\.(?:png|jpe?g|webp|gif|svg|avif)$/i.test(file)) {
    throw new Error(`Unexpected logo URL: ${rawUrl}`)
  }
  return file
}

function mapCoins(input: CoinMap, metadata: CoinMetadata[]): Coin[] {
  const bySymbol = new Map<string, CoinMetadata>()
  for (const coin of [...metadata].sort(byRank)) {
    const symbol = coin.symbol.toLowerCase()
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, coin)
  }
  const coins: Coin[] = []
  for (const [symbol, { source, url }] of Object.entries(input)) {
    if (source === "monogram" || !url) continue
    const file = originalFile(url, "coins")
    const stem = fileStem(file)
    const metadata = bySymbol.get(symbol.toLowerCase())
    coins.push({
      symbol, stem, file, sm: `${stem}.webp`, rank: metadata?.rank ?? unranked,
      ...(metadata && { name: metadata.name, slug: metadata.slug, cmc: metadata.id }),
    })
  }
  return coins.sort((a, b) =>
    (a.rank ?? unranked) - (b.rank ?? unranked) || a.symbol.localeCompare(b.symbol, "en"))
}

async function copyFromCdn(path: string, url: string, get: Get) {
  const response = await get(url)
  if (response.status === 404) return false
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
  if (!response.headers.get("content-type")?.startsWith("image/")) throw new Error(`Unexpected content type: ${url}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!bytes.byteLength) throw new Error(`Empty image: ${url}`)
  await writeAtomic(path, bytes)
  return true
}

async function present(path: string) {
  const file = await stat(path).catch(error => {
    if (error?.code !== "ENOENT") throw error
  })
  return Boolean(file?.isFile() && file.size)
}

async function makeSmall(original: string, thumbnail: string) {
  const temporary = `${thumbnail}.${process.pid}.sync-part`
  await mkdir(dirname(temporary), { recursive: true })
  const proc = Bun.spawn(["cwebp", "-quiet", "-resize", "96", "0", "-q", "80", original, "-o", temporary], {
    stdout: "ignore", stderr: "pipe",
  })
  const diagnostics = await new Response(proc.stderr).text()
  if (await proc.exited !== 0) throw new Error(diagnostics.trim() || "cwebp failed")
  await rename(temporary, thumbnail)
}

async function syncImages(root: string, jobs: Job[], failures: Failure[], get: Get) {
  const stats = { coins: { original: 0, sm: 0 }, exchanges: { original: 0, sm: 0 }, generated: 0 }
  let cursor = 0
  let unavailable: string | undefined

  async function download(job: Job) {
    const { kind, key, logo } = job
    const original = join(root, "icons", kind, logo.file)
    const thumbnail = join(root, "icons", "sm", kind, logo.sm)
    const url = `${cdn}/${prefixOf(kind)}`
    let stage: "original" | "sm" = "original"
    try {
      if (!await present(original)) {
        if (unavailable) throw new Error(unavailable)
        if (!await copyFromCdn(original, `${url}/${encodeURIComponent(logo.file)}`, get)) throw new Error("CDN original returned HTTP 404")
      }
      stats[kind].original++
      stage = "sm"
      if (!await present(thumbnail)) {
        if (unavailable) throw new Error(unavailable)
        if (!await copyFromCdn(thumbnail, `${url}/sm/${encodeURIComponent(logo.sm)}`, get)) {
          await makeSmall(original, thumbnail)
          stats.generated++
        }
      }
      stats[kind].sm++
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code === "ConnectionRefused" || code === "FailedToOpenSocket" || code === "ENOTFOUND") {
        unavailable = `CDN connection unavailable (${code})`
      }
      failures.push({ key: `${kind}/${key}`, stage, reason: unavailable ?? errorMessage(error) })
    }
  }

  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < jobs.length) await download(jobs[cursor++]!)
  }))
  return stats
}

async function prune(root: string, jobs: Job[]) {
  const keep = new Set(jobs.flatMap(({ kind, logo }) => [`${kind}/${logo.file}`, `sm/${kind}/${logo.sm}`]))
  let removed = 0
  for (const dir of ["coins", "exchanges", "sm/coins", "sm/exchanges"]) {
    const path = join(root, "icons", dir)
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isFile() && /\.(?:png|jpe?g|webp|gif|svg|avif)$/i.test(entry.name) && !keep.has(`${dir}/${entry.name}`)) {
        await rm(join(path, entry.name))
        removed++
      }
    }
  }
  console.log(`Pruned ${removed} stale archive files.`)
}

export async function syncArchive(root: string, args: string[], get = publicGet) {
  if (args.some(arg => !["--index-only", "--refresh-metadata", "--prune"].includes(arg))) {
    throw new Error("Usage: bun run sync [--index-only] [--refresh-metadata] [--prune]")
  }
  const indexOnly = args.includes("--index-only")
  const shouldPrune = args.includes("--prune")
  if (indexOnly && shouldPrune) throw new Error("--prune requires an image sync")
  const listing = resolve(root, "../listing")
  const sourceData = join(listing, "listing-dashboard/backend/src/data")
  const [coinInput, exchangeInput, names, metadata] = await Promise.all([
    readJson<CoinMap>(join(sourceData, "coin-logos.json")),
    readJson<Record<string, string>>(join(sourceData, "exchange-logos.json")),
    readJson<Record<string, { name: string }>>(join(listing, "exchange-logos/_index.json")),
    loadMetadata(join(root, "data/coinmarketcap.json"), !indexOnly || args.includes("--refresh-metadata"), get),
  ])
  const failures: Failure[] = []
  const coins = mapCoins(coinInput, metadata)
  const exchanges: Exchange[] = Object.entries(exchangeInput).map(([slug, url]) => {
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(slug)) throw new Error(`Invalid exchange slug: ${slug}`)
    const file = originalFile(url, "exchanges")
    return { slug, name: names[slug]?.name ?? slug, file, sm: `${fileStem(file)}.webp` }
  }).sort((a, b) => a.name.localeCompare(b.name, "en") || a.slug.localeCompare(b.slug, "en"))

  await Promise.all([
    writeJson(join(root, "data/coins.json"), coins),
    writeJson(join(root, "data/exchanges.json"), exchanges),
  ])
  const enriched = coins.filter(coin => coin.cmc !== undefined).length
  console.log(`Index: ${coins.length} coins (${enriched} with CoinMarketCap metadata), ${exchanges.length} exchanges.`)
  if (!indexOnly) {
    const jobs: Job[] = [
      ...coins.map(logo => ({ kind: "coins" as const, key: logo.symbol, logo })),
      ...exchanges.map(logo => ({ kind: "exchanges" as const, key: logo.slug, logo })),
    ]
    for (const directory of ["coins", "exchanges", "sm/coins", "sm/exchanges"]) {
      await mkdir(join(root, "icons", directory), { recursive: true })
    }
    const stats = await syncImages(root, jobs, failures, get)
    console.log(`Archive: ${stats.coins.original} coin originals, ${stats.coins.sm} coin WebPs, ${stats.exchanges.original} exchange originals, ${stats.exchanges.sm} exchange WebPs (${stats.generated} generated).`)
    if (shouldPrune && !failures.length) await prune(root, jobs)
    else if (shouldPrune) console.error("Prune skipped because the catalog or download set is incomplete.")
  }
  failures.sort((a, b) => a.key.localeCompare(b.key, "en") || a.stage.localeCompare(b.stage, "en"))
  await writeJson(join(root, ".codex-sync-failures.json"), failures)
  if (failures.length) console.log(`${failures.length} failures recorded in .codex-sync-failures.json.`)
  return failures
}

if (import.meta.main) {
  try {
    const failures = await syncArchive(resolve(import.meta.dir, ".."), process.argv.slice(2))
    if (failures.length) process.exitCode = 1
  } catch (error) {
    console.error(errorMessage(error))
    process.exitCode = 1
  }
}
