import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { syncArchive } from "./sync"

const cdn = "https://logos.listingapis.com"
const quickSearch = "https://s2.coinmarketcap.com/generated/search/quick_search.json"

test("syncs ticker-based filenames and retains unranked coins with saved or refreshed metadata", async () => {
  const fixture = await mkdtemp(join(import.meta.dir, "../.codex-sync-test-"))
  const root = join(fixture, "icons")
  const inputs = "listing/listing-dashboard/backend/src/data"
  async function save(path: string, data: unknown) {
    const file = join(fixture, path)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(data))
  }
  const read = (path: string) => Bun.file(join(root, path)).json()

  try {
    await save(`${inputs}/coin-logos.json`, {
      "$TRUMP": { url: `${cdn}/coin-logos/$trump.jpg`, source: "coingecko" },
      "龙LONG": { url: `${cdn}/coin-logos/%E9%BE%99long.png`, source: "coingecko" },
      "4444": { url: `${cdn}/coin-logos/4444-cdn.png`, source: "spothq" },
      APPLE: { url: `${cdn}/coin-logos/apple.png`, source: "coingecko" },
      SKIP: { source: "monogram" },
    })
    await save(`${inputs}/exchange-logos.json`, { binance: `${cdn}/exchange-logos/binance.png` })
    await save("listing/exchange-logos/_index.json", { binance: { name: "Binance" } })
    const seed = { id: 1, symbol: "apple", name: "Apple", slug: "apple", rank: 2 }
    await save("icons/data/coinmarketcap.json", { complete: false, coins: [seed] })

    const expectedKeys = [
      "coin-logos/%24trump.jpg", "coin-logos/sm/%24trump.webp",
      "coin-logos/%E9%BE%99long.png", "coin-logos/sm/%E9%BE%99long.webp",
      "coin-logos/4444-cdn.png", "coin-logos/sm/4444-cdn.webp",
      "coin-logos/apple.png", "coin-logos/sm/apple.webp",
      "exchange-logos/binance.png", "exchange-logos/sm/binance.webp",
    ]
    const requests: string[] = []
    let quickSearchAvailable = false
    const best = { id: 4444, symbol: "$trump", name: "Ranked Trump", slug: "ranked-trump", rank: 2 }
    const get = async (url: string) => {
      requests.push(url)
      if (url === quickSearch) {
        if (!quickSearchAvailable) throw new Error("offline")
        return Response.json([
          { id: 7, symbol: "$TRUMP", name: "Other Trump", slug: "other-trump", rank: 80 },
          { ...best, extra: "discarded" },
          seed,
        ])
      }
      const key = url.slice(cdn.length + 1)
      if (!url.startsWith(`${cdn}/`) || !expectedKeys.includes(key)) throw new Error(`Unexpected URL: ${url}`)
      return new Response(key, { headers: { "Content-Type": "image/png" } })
    }

    expect(await syncArchive(root, [], get)).toEqual([])
    expect(requests.sort()).toEqual([quickSearch, ...expectedKeys.map(key => `${cdn}/${key}`)].sort())
    const fallback = await read("data/coins.json")
    expect(fallback.map((coin: { symbol: string }) => coin.symbol)).toEqual(["APPLE", "$TRUMP", "4444", "龙LONG"])
    expect(await read("data/coinmarketcap.json")).toEqual({ complete: false, coins: [seed] })
    for (const [path, key] of [
      ["coins/$trump.jpg", "coin-logos/%24trump.jpg"],
      ["sm/coins/$trump.webp", "coin-logos/sm/%24trump.webp"],
      ["coins/龙long.png", "coin-logos/%E9%BE%99long.png"],
      ["sm/coins/龙long.webp", "coin-logos/sm/%E9%BE%99long.webp"],
      ["coins/4444-cdn.png", "coin-logos/4444-cdn.png"],
      ["sm/coins/4444-cdn.webp", "coin-logos/sm/4444-cdn.webp"],
      ["exchanges/binance.png", "exchange-logos/binance.png"],
    ]) {
      expect(await Bun.file(join(root, "icons", path)).text()).toBe(key)
    }
    expect(await read("data/exchanges.json")).toEqual([
      { slug: "binance", name: "Binance", file: "binance.png", sm: "binance.webp" },
    ])

    requests.length = 0
    quickSearchAvailable = true
    expect(await syncArchive(root, [], get)).toEqual([])
    expect(requests).toEqual([quickSearch])
    const snapshot = await read("data/coinmarketcap.json")
    expect(snapshot.slice(0, 2)).toEqual([seed, best])
    const refreshed = await read("data/coins.json")
    expect(refreshed.map((coin: { symbol: string }) => coin.symbol)).toEqual(["$TRUMP", "APPLE", "4444", "龙LONG"])
    expect(refreshed[0]).toEqual({
      symbol: "$TRUMP", stem: "$trump", file: "$trump.jpg", sm: "$trump.webp",
      rank: 2, name: "Ranked Trump", slug: "ranked-trump", cmc: 4444,
    })
    expect(refreshed[2]).toEqual({
      symbol: "4444", stem: "4444-cdn", file: "4444-cdn.png", sm: "4444-cdn.webp",
      rank: Number.MAX_SAFE_INTEGER,
    })

    requests.length = 0
    expect(await syncArchive(root, ["--index-only"], get)).toEqual([])
    expect(requests).toEqual([])
    expect(await read("data/coins.json")).toEqual(refreshed)
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})
