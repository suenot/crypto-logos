# Crypto Icons

A searchable collection of trading logos for coins and exchanges. The gallery and downloads live at [icons.marketmaker.cc](https://icons.marketmaker.cc); the images are served from Cloudflare R2 storage (`logos.listingapis.com`).

## Get started

```sh
bun install
bun run dev
bun run build
bun test
bun run typecheck
```

Use Bun 1.3 or later and Node.js 22 for the Vite tooling. The site builds from `data/` without contacting the logo CDN or CoinMarketCap. Vite writes the site and its compact public indexes to `site/dist`. Run `bun run preview` to serve the built site locally.

## Sync the archive

Put the read-only `listing` checkout alongside this repository. Run `bun run sync` with HTTPS access to the public logo CDN and install `cwebp` for thumbnail conversion when a CDN WebP is missing.

Sync reads the listing logo maps and skips monograms. Coin originals keep their CDN filenames in `icons/coins/` and their 96px-wide thumbnails use the same stems in `icons/sm/coins/`. Existing nonempty files are reused. Download failures are recorded in `.codex-sync-failures.json`. Use `--prune` to remove stale image files after a successful sync.

Every ticker with an image appears in the catalog. Full syncs refresh the [CoinMarketCap quick-search snapshot](https://s2.coinmarketcap.com/generated/search/quick_search.json) and use the best-ranked match for each ticker. If the refresh fails, sync uses `data/coinmarketcap.json`. Unranked entries sort alphabetically after ranked coins. Use `--index-only` to rebuild the catalogs offline from the listing maps and saved metadata. Combine it with `--refresh-metadata` to refresh the snapshot without downloading images.

## Embed an icon

The icons already live in the Cloudflare R2 bucket `listingapis-logos`, public at `https://logos.listingapis.com`. The listing project loads them from there, and every other project reuses the same paths:

| What | URL |
| --- | --- |
| Coin original | `https://logos.listingapis.com/coin-logos/<lowercase-ticker>.<ext>` |
| Coin thumbnail, 96px WebP | `https://logos.listingapis.com/coin-logos/sm/<lowercase-ticker>.webp` |
| Exchange original | `https://logos.listingapis.com/exchange-logos/<file>` |
| Exchange thumbnail, 96px WebP | `https://logos.listingapis.com/exchange-logos/sm/<slug>.webp` |

The extension of an original varies, so take the exact file name from `data/coins.json` and `data/exchanges.json` (or from the icon panel on the site).

```html
<img src="https://logos.listingapis.com/coin-logos/btc.png" alt="Bitcoin" width="48" height="48">
```

icons.marketmaker.cc is where you browse, search and download. Do not copy icons into other repositories. See the [embedding guide](docs/EMBED.md) and [logo notice](LICENSE-NOTICE.md).

## Deploy

Build the site and run the tests and typecheck first. Set `CLOUDFLARE_API_TOKEN` for the Cloudflare account that owns `listingapis-logos` and the `marketmaker.cc` zone before running the deploy command.

```sh
bun x wrangler@latest deploy
```

Wrangler configures the `icons-marketmaker-cc` Worker, the `LOGOS` R2 binding, the static site and the `icons.marketmaker.cc` custom domain. After deployment, check `/`, `/index/coins.json`, and `/coin/BTC?size=full`.
