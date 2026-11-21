# Crypto Icons

A searchable collection of trading logos for coins and exchanges. The gallery, ZIP archive, and CDN URLs are designed for use from [icons.marketmaker.cc](https://icons.marketmaker.cc).

## Get started

```sh
bun install
bun run dev
bun run build
bun test
bunx tsc --noEmit
```

Use Bun 1.3 or later and Node.js 22 for the Vite tooling. The site builds from `data/` without contacting the logo CDN or CoinMarketCap. Vite writes the site and its compact public indexes to `site/dist`. Run `bun run preview` to serve the built site locally.

## Sync the archive

Put the read-only `listing` checkout alongside this repository. Run `bun run sync` with HTTPS access to the public logo CDN and install `cwebp` for thumbnail conversion when a CDN WebP is missing.

Sync reads the listing logo maps and skips monograms. Coin originals keep their CDN filenames in `icons/coins/` and their 96px-wide thumbnails use the same stems in `icons/sm/coins/`. Existing nonempty files are reused. Download failures are recorded in `.codex-sync-failures.json`. Use `--prune` to remove stale image files after a successful sync.

Every ticker with an image appears in the catalog. Full syncs refresh the [CoinMarketCap quick-search snapshot](https://s2.coinmarketcap.com/generated/search/quick_search.json) and use the best-ranked match for each ticker. If the refresh fails, sync uses `data/coinmarketcap.json`. Unranked entries sort alphabetically after ranked coins. Use `--index-only` to rebuild the catalogs offline from the listing maps and saved metadata. Combine it with `--refresh-metadata` to refresh the snapshot without downloading images.

## Embed an icon

Use `/coin/{symbol}` for coin icons and `/exchange/{slug}` for exchange icons. Symbols are case-insensitive, and numeric tickers such as `4444` work as written. URL-encode symbols with special characters, such as `/coin/%24TRUMP`. The default is the small WebP. Add `?size=full` for the original.

```html
<img src="https://icons.marketmaker.cc/coin/BTC" alt="Bitcoin" width="48" height="48">
```

All our trading projects should load coin and exchange icons through this Cloudflare service. Keep the icon files in this collection. See the [embedding guide](docs/EMBED.md) and [logo notice](LICENSE-NOTICE.md).

## Deploy

Build the site and run the tests and typecheck first. Set `CLOUDFLARE_API_TOKEN` for the Cloudflare account that owns `listingapis-logos` and the `marketmaker.cc` zone before running the deploy command.

```sh
bunx wrangler deploy
```

Wrangler configures the `icons-marketmaker-cc` Worker, the `LOGOS` R2 binding, the static site and the `icons.marketmaker.cc` custom domain. After deployment, check `/`, `/index/coins.json`, `/coin/BTC`, and `/exchange/binance?size=full`.
