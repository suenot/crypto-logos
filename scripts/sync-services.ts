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
// "vendor:<file>@<origin>" reads sources/services/<file>: an exact copy of the brand's own icon at <origin>,
// kept in the repo because that site refuses scripted downloads (bot walls, a TLS chain outside the public roots).
// Every logo is checked by eye against the brand's current site before it ships.
type Entry = [slug: string, name: string, kind: ServiceLogo["kind"], sources: string[]]

export const entries: Entry[] = [
  ["mcp", "Model Context Protocol", "registry", ["simple-icons:modelcontextprotocol.svg"]],
  ["glama", "Glama", "registry", ["https://glama.ai/favicon.svg", "https://glama.ai/pwa-icon.png"]],
  ["smithery", "Smithery", "registry", ["https://www.smithery.ai/favicon.svg", "https://www.smithery.ai/apple-touch-icon.png"]],
  ["pulsemcp", "PulseMCP", "registry", ["https://github.com/pulsemcp.png?size=256"]],
  ["mcp-so", "mcp.so", "registry", ["lobe-icons:mcpso-color.svg","lobe-icons:mcpso.svg"]],
  ["mcpmarket", "MCP Market", "registry", ["https://mcpmarket.com/favicon.png"]],
  ["github", "GitHub", "tool", ["simple-icons:github.svg"]],
  ["ccxt", "CCXT", "tool", ["https://docs.ccxt.com/icon.svg"]],
  ["tradingview", "TradingView", "tool", ["https://static.tradingview.com/static/images/favicon/android-chrome-512x512.png"]],
  ["quantconnect", "QuantConnect", "tool", ["simple-icons:quantconnect.svg"]],
  ["freqtrade", "Freqtrade", "tool", ["https://www.freqtrade.io/en/stable/images/logo.png","https://github.com/freqtrade.png?size=256"]],
  ["tradestaq", "TradeStaq", "tool", ["https://www.tradestaq.com/apple-icon.png"]],
  ["profitmaker", "Profitmaker", "tool", ["https://profitmaker.cc/apple-touch-icon.png"]],
  ["hummingbot", "Hummingbot", "tool", ["https://hummingbot.org/assets/brand/logo-color.png", "https://github.com/hummingbot.png?size=256"]],
  ["auth-marketmaker", "auth.marketmaker.cc", "tool", ["https://auth.marketmaker.cc/icon.svg"]],
  ["cloudflare", "Cloudflare", "tool", ["https://github.com/cloudflare.png?size=256"]],
  ["alpaca", "Alpaca", "broker", ["https://alpaca.markets/icon.svg"]],
  ["t-bank", "T-Bank (T-Invest)", "broker", ["vendor:t-bank.png@https://cdn.tbank.ru/params/common_front/resourses/icons/new/icon-512x512.png"]],
  ["public-com", "Public.com", "broker", ["https://public.com/wp-content/uploads/2026/03/favicon.svg","https://public.com/wp-content/uploads/2026/03/favicon-180x180-1.png"]],
  ["clear-street", "Clear Street", "broker", ["https://www.clearstreet.io/icon.svg"]],
  ["zerodha", "Zerodha", "broker", ["simple-icons:zerodha.svg"]],
  ["metatrader", "MetaTrader", "broker", ["https://www.metatrader5.com/i/favicons/apple-touch-icon-180x180.png"]],
  ["coingecko", "CoinGecko", "data", ["https://1419036772-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/organizations%2FnJ08f98e3wFUIuIbM8N7%2Fsites%2Fsite_Jusyp%2Ficon%2FsJWmHFbIQeZ7Gq8xFJfK%2FApp%20Icon%20Grid.png?alt=media&token=13bfe52f-7214-4752-a0f8-a0e1fe42d859"]],
  ["coinmarketcap", "CoinMarketCap", "data", ["https://coinmarketcap.com/apple-touch-icon.png"]],
  ["defillama", "DefiLlama", "data", ["https://github.com/DefiLlama.png?size=256"]],
  ["coinpaprika", "CoinPaprika", "data", ["https://coinpaprika.com/favicon.svg","https://coinpaprika.com/apple-touch-icon.png"]],
  ["coinapi", "CoinAPI", "data", ["https://github.com/coinapi.png?size=256"]],
  ["alpha-vantage", "Alpha Vantage", "data", ["https://github.com/alphavantage.png?size=256"]],
  ["trading-economics", "Trading Economics", "data", ["https://d3e5kp2e91w0k0.cloudfront.net/favicon.svg"]],
  ["fred", "FRED", "data", ["vendor:fred.svg@https://fred.stlouisfed.org/images/FRED_Logo_for_Waffle.svg"]],
  ["sec", "SEC EDGAR", "data", ["vendor:sec.png@https://www.sec.gov/themes/custom/uswds_sec/assets/img/favicons/android-chrome-512x512.png"]],
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
  ["alchemy", "Alchemy", "onchain", ["https://media.alchemy.com/1699253173-alchemy-logo.svg"]],
  ["hive-intelligence", "Hive Intelligence", "onchain", ["https://www.hiveintelligence.xyz/brand/favicon-512.png"]],
  ["whale-alert", "Whale Alert", "onchain", ["https://whale-alert.io/assets/images/web-app-manifest-192x192.png"]],
  ["deep-blue-alpha", "Deep Blue Alpha", "onchain", ["https://deepbluealpha.io/static/img/apple-touch-icon.png"]],
  ["glassnode", "Glassnode", "onchain", ["https://glassnode.com/favicon.png"]],
  ["arkham", "Arkham", "onchain", ["https://logos.marketmaker.cc/coin-logos/arkm.png"]],
  ["whaleradar", "WhaleRadar", "signals", ["https://whaleradar.com/icon-512.png", "https://whaleradar.com/apple-touch-icon.png"]],
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

// Inlines the light-theme rules of an embedded <style> as presentation attributes, so the SVG passes normalizeSvg
// and renders the same in every context. Dark-mode @media blocks are dropped. Only plain tag and .class selectors
// are supported; anything else throws, so an unsupported stylesheet is never silently mangled.
export function inlineSvgStyles(svg: string): string {
  const rules: { selector: string; attributes: [string, string][] }[] = []
  let out = svg.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, body: string) => {
    let css = body.replace(/\/\*[\s\S]*?\*\//g, "")
    for (let at = css.search(/@media\b/); at >= 0; at = css.search(/@media\b/)) {
      let depth = 0
      let end = css.indexOf("{", at)
      if (end < 0) throw new Error("Unclosed @media rule")
      for (; end < css.length; end++) {
        if (css[end] === "{") depth++
        else if (css[end] === "}" && --depth === 0) break
      }
      css = css.slice(0, at) + css.slice(end + 1)
    }
    for (const [, selectors, declarations] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const attributes = declarations.split(";")
        .map(declaration => declaration.split(":").map(part => part.trim()) as [string, string])
        .filter(([name, value]) => name && value)
      for (const selector of selectors.split(",").map(part => part.trim())) {
        if (!/^\.?[A-Za-z][\w-]*$/.test(selector)) throw new Error(`Unsupported SVG style selector ${selector}`)
        rules.push({ selector, attributes })
      }
    }
    return ""
  })
  // Class rules go first: an attribute is only added when the element has none, so a class beats a tag, as in CSS.
  rules.sort((a, b) => Number(b.selector.startsWith(".")) - Number(a.selector.startsWith(".")))
  for (const { selector, attributes } of rules) {
    const matches = selector.startsWith(".")
      ? (tag: string) => (/\sclass\s*=\s*["']([^"']*)["']/.exec(tag)?.[1].split(/\s+/) ?? []).includes(selector.slice(1))
      : (tag: string) => new RegExp(`^<${selector}\\b`).test(tag)
    out = out.replace(/<(?!\/|!|\?)[^>]+>/g, tag => {
      if (!matches(tag)) return tag
      const extra = attributes.filter(([name]) => !new RegExp(`\\s${name}\\s*=`).test(tag)).map(([name, value]) => ` ${name}="${value}"`).join("")
      return tag.replace(/\s*(\/?)>$/, `${extra}$1>`)
    })
  }
  return out
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
    const vendor = /^vendor:([\w.-]+)@(https:\/\/.+)$/.exec(source)
    const { bytes, type } = vendor
      ? { bytes: await readFile(join(resolve(import.meta.dir, ".."), "sources", "services", vendor[1])), type: vendor[1].endsWith(".svg") ? "image/svg+xml" : "" }
      : await download(source)
    const text = bytes.subarray(0, 512).toString("utf8")
    if (type.includes("svg") || /^\s*(<\?xml[^>]*>\s*)?<svg\b/.test(text)) {
      svg = normalizeSvg(inlineSvgStyles(bytes.toString("utf8").replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*<\?xml[^>]*>\s*/, "").trimStart()))
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
      rows.push({ slug, name, kind, file: built.file, sm: `${slug}.webp`, source: built.source.replace(/^vendor:[\w.-]+@/, "") })
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
