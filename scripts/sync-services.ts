import { readFile } from "node:fs/promises"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import sharp from "sharp"
import type { ServiceLogo } from "../data/catalog"
import { writeAtomic } from "./sync"
import { normalizeSvg, unpackSource } from "./sync-ai"

// Logos of the services around trading: market data, news, on-chain analytics, brokers, MCP registries and tools.
// Exchanges, coins and AI companies have their own categories and are not repeated here.
// Each entry lists its sources in order of preference: a package icon ("simple-icons:file.svg",
// "lobe-icons:file.svg"), the brand's own site icon, or the brand's official GitHub organization avatar.
type Entry = [slug: string, name: string, kind: ServiceLogo["kind"], sources: string[]]

export const entries: Entry[] = [
  ["mcp", "Model Context Protocol", "registry", ["simple-icons:modelcontextprotocol.svg"]],
  ["glama", "Glama", "registry", ["lobe-icons:glama.svg"]],
  ["smithery", "Smithery", "registry", ["lobe-icons:smithery-color.svg","lobe-icons:smithery.svg"]],
  ["pulsemcp", "PulseMCP", "registry", ["https://github.com/pulsemcp.png?size=256"]],
  ["mcp-so", "mcp.so", "registry", ["lobe-icons:mcpso-color.svg","lobe-icons:mcpso.svg"]],
  ["mcpmarket", "MCP Market", "registry", ["https://mcpmarket.com/favicon.png"]],
  ["github", "GitHub", "tool", ["simple-icons:github.svg"]],
  ["ccxt", "CCXT", "tool", ["https://github.com/ccxt.png?size=256"]],
  ["tradingview", "TradingView", "tool", ["simple-icons:tradingview.svg"]],
  ["quantconnect", "QuantConnect", "tool", ["simple-icons:quantconnect.svg"]],
  ["freqtrade", "Freqtrade", "tool", ["https://www.freqtrade.io/en/stable/images/logo.png","https://github.com/freqtrade.png?size=256"]],
  ["tradestaq", "TradeStaq", "tool", ["https://www.tradestaq.com/apple-icon.png"]],
  ["alpaca", "Alpaca", "broker", ["https://alpaca.markets/icon.svg", "https://github.com/alpacahq.png?size=256"]],
  ["t-bank", "T-Bank (T-Invest)", "broker", ["https://github.com/Tinkoff.png?size=256"]],
  ["public-com", "Public.com", "broker", ["https://public.com/wp-content/uploads/2026/03/favicon.svg","https://public.com/wp-content/uploads/2026/03/favicon-180x180-1.png"]],
  ["clear-street", "Clear Street", "broker", ["https://github.com/clear-street.png?size=256"]],
  ["zerodha", "Zerodha", "broker", ["simple-icons:zerodha.svg"]],
  ["metatrader", "MetaTrader", "broker", ["https://www.metatrader5.com/i/favicons/apple-touch-icon-180x180.png"]],
  ["coingecko", "CoinGecko", "data", ["https://github.com/coingecko.png?size=256"]],
  ["coinmarketcap", "CoinMarketCap", "data", ["simple-icons:coinmarketcap.svg"]],
  ["defillama", "DefiLlama", "data", ["https://github.com/DefiLlama.png?size=256"]],
  ["coinpaprika", "CoinPaprika", "data", ["https://coinpaprika.com/favicon.svg","https://coinpaprika.com/apple-touch-icon.png"]],
  ["coinapi", "CoinAPI", "data", ["https://github.com/coinapi.png?size=256"]],
  ["alpha-vantage", "Alpha Vantage", "data", ["https://github.com/alphavantage.png?size=256"]],
  ["trading-economics", "Trading Economics", "data", ["https://d3e5kp2e91w0k0.cloudfront.net/favicon.svg"]],
  ["financial-datasets", "Financial Datasets", "data", ["https://www.financialdatasets.ai/apple-touch-icon.png"]],
  ["tickdb", "TickDB", "data", ["https://tickdb.ai/android-chrome-512x512.png"]],
  ["coincap", "CoinCap", "data", ["https://coincap.io/static/icons/apple-touch-icon-180x180.png"]],
  ["the-graph", "The Graph", "data", ["https://storage.thegraph.com/favicons/256x256.png"]],
  ["cryptopanic", "CryptoPanic", "news", ["https://static.cryptopanic.com/static/img/favicon/apple-touch-icon.5d3be3e1e601.png"]],
  ["alternative-me", "Alternative.me (Fear & Greed)", "news", ["https://alternative.me/apple-touch-icon.png"]],
  ["santiment", "Santiment", "news", ["https://santiment.net/favicon.png"]],
  ["lunarcrush", "LunarCrush", "news", ["https://lunarcrush.com/apple-touch-icon.png"]],
  ["dappier", "Dappier", "news", ["https://assets.dappier.com/logos/Dappier_Favicon.png"]],
  ["nansen", "Nansen", "onchain", ["https://framerusercontent.com/images/NKwtRwJIxYWpzW6NWnqma6yeJ0.png","https://github.com/nansen-ai.png?size=256"]],
  ["bitquery", "Bitquery", "onchain", ["https://bitquery.io/favicon/favicon-192x192.png"]],
  ["dune", "Dune", "onchain", ["https://dune.com/assets/favicon.svg","https://dune.com/assets/apple-touch-icon.png"]],
  ["alchemy", "Alchemy", "onchain", ["simple-icons:alchemy.svg"]],
  ["hive-intelligence", "Hive Intelligence", "onchain", ["https://www.hiveintelligence.xyz/brand/favicon-512.png"]],
  ["whale-alert", "Whale Alert", "onchain", ["https://whale-alert.io/assets/images/web-app-manifest-192x192.png"]],
  ["deep-blue-alpha", "Deep Blue Alpha", "onchain", ["https://deepbluealpha.io/static/img/apple-touch-icon.png"]],
  ["glassnode", "Glassnode", "onchain", ["https://glassnode.com/favicon.png"]],
  ["arkham", "Arkham", "onchain", ["https://logos.marketmaker.cc/coin-logos/arkm.png"]],
  ["whaleradar", "WhaleRadar", "signals", ["https://whaleradar.com/favicon.svg","https://whaleradar.com/apple-touch-icon.png"]],
  ["antalpha", "Antalpha", "signals", ["https://www.antalpha.com/apple-icon.png?apple-icon.2u-2xk6xt2wmn.png"]],
  ["coinrithm", "CoinRithm", "signals", ["https://www.coinrithm.com/icon.png?icon.1mk3n35yfxadj.png"]],
  ["polymarket", "Polymarket", "signals", ["https://polymarket.com/icons/apple-touch-icon.png"]],
  ["polytrackers", "PolyTrackers", "signals", ["https://polytrackers.com/icon.png?v=20260723"]],
  ["unusual-whales", "Unusual Whales", "signals", ["https://unusualwhales.com/favicon.svg","https://unusualwhales.com/apple-icon-180x180.png"]],
  ["uniswap", "Uniswap", "dex", ["https://cdn.app.uniswap.org/images/512x512_App_Icon.png"]],
  ["jupiter", "Jupiter", "dex", ["https://jup.ag/favicon.svg","https://jup.ag/apple-touch-icon.png"]],
  ["armor", "Armor Wallet", "dex", ["https://github.com/armorwallet.png?size=256"]],
]

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

async function download(url: string): Promise<{ bytes: Buffer; type: string }> {
  const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/svg+xml,image/png,image/*" }, redirect: "follow" })
  if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  return { bytes: Buffer.from(await response.arrayBuffer()), type: response.headers.get("content-type") ?? "" }
}

type Built = { file: string; original: Buffer | string; webp: Buffer; source: string }

async function build(slug: string, source: string, packages: Record<string, string>, hexBySlug: Map<string, string>): Promise<Built> {
  let svg: string | undefined
  let raster: Buffer | undefined
  const packageSource = /^(simple-icons|lobe-icons):(.+)$/.exec(source)
  if (packageSource) {
    const [, name, file] = packageSource
    const input = await readFile(join(packages[name], "icons", file), "utf8")
    const hex = name === "simple-icons" ? hexBySlug.get(file.slice(0, -4)) : undefined
    if (name === "simple-icons" && !hex) throw new Error(`Missing brand color for ${file}`)
    svg = normalizeSvg(input, hex)
  } else {
    const { bytes, type } = await download(source)
    const text = bytes.subarray(0, 512).toString("utf8")
    if (type.includes("svg") || /^\s*(<\?xml[^>]*>\s*)?<svg\b/.test(text)) {
      svg = normalizeSvg(bytes.toString("utf8").replace(/^\s*<\?xml[^>]*>\s*/, "").replace(/<!--[\s\S]*?-->/g, ""))
    } else {
      const meta = await sharp(bytes).metadata()
      if (!meta.width || !meta.height || Math.max(meta.width, meta.height) < 64) throw new Error(`${source} is smaller than 64px`)
      raster = await sharp(bytes).resize(256, 256, { fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer()
    }
  }
  const image = svg !== undefined ? Buffer.from(svg) : raster!
  const webp = await sharp(image, { density: 300 })
    .resize(96, 96, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 85 })
    .toBuffer()
  return svg !== undefined
    ? { file: `${slug}.svg`, original: svg, webp, source }
    : { file: `${slug}.png`, original: raster!, webp, source }
}

async function syncServices() {
  const root = resolve(import.meta.dir, "..")
  const temp = await mkdtemp(join(tmpdir(), "sync-services-"))
  try {
    const packages = { "lobe-icons": await unpackSource("lobe-icons", temp), "simple-icons": await unpackSource("simple-icons", temp) }
    const colors: { slug: string; hex: string }[] = await Bun.file(join(packages["simple-icons"], "data", "simple-icons.json")).json()
    const hexBySlug = new Map(colors.map(({ slug, hex }) => [slug, hex]))
    const rows: ServiceLogo[] = []
    const failures: string[] = []
    for (const [slug, name, kind, sources] of entries) {
      let built: Built | undefined
      const errors: string[] = []
      for (const source of sources) {
        try { built = await build(slug, source, packages, hexBySlug); break } catch (error) { errors.push(String(error instanceof Error ? error.message : error)) }
      }
      if (!built) { failures.push(`${slug}: ${errors.join("; ")}`); continue }
      await writeAtomic(join(root, "icons", "services", built.file), built.original)
      await writeAtomic(join(root, "icons", "sm", "services", `${slug}.webp`), built.webp)
      rows.push({ slug, name, kind, file: built.file, sm: `${slug}.webp`, source: built.source })
    }
    rows.sort((a, b) => a.name.localeCompare(b.name, "en"))
    await writeAtomic(join(root, "data", "services.json"), `[\n${rows.map(row => `  ${JSON.stringify(row)}`).join(",\n")}\n]\n`)
    console.log(`Service archive: ${rows.length} logos.`)
    if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1 }
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
}

if (import.meta.main) await syncServices()
