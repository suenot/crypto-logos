# Crypto Logos

A searchable collection of logos for coins, exchanges, AI companies, models, and agent harnesses. The gallery and downloads live at [logos.marketmaker.cc](https://logos.marketmaker.cc), which also serves the images from Cloudflare R2 storage. The old `icons.marketmaker.cc` and `logos.listingapis.com` keep working.

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

Run `bun run sync:ai` to generate the AI SVGs in `icons/ai/`, 96×96 WebP thumbnails in `icons/sm/ai/`, and the catalog in `data/ai.json` from the pinned npm packages. For an offline sync, set `AI_LOGO_TARBALL_DIR` to a directory containing `lobehub-icons-static-svg-1.104.0.tgz` and `simple-icons-16.15.0.tgz`. Run `bun --no-env-file scripts/upload-ai.ts --dry-run` to list the R2 keys and content types.

## Embed an icon

The files live in the Cloudflare R2 bucket `listingapis-logos`. `https://logos.marketmaker.cc` serves them under the exact storage paths (the same keys the listing project uses via `logos.listingapis.com`). Every project uses these paths:

| What | URL |
| --- | --- |
| Coin original | `https://logos.marketmaker.cc/coin-logos/<lowercase-ticker>.<ext>` |
| Coin thumbnail, 96px WebP | `https://logos.marketmaker.cc/coin-logos/sm/<lowercase-ticker>.webp` |
| Exchange original | `https://logos.marketmaker.cc/exchange-logos/<file>` |
| Exchange thumbnail, 96px WebP | `https://logos.marketmaker.cc/exchange-logos/sm/<slug>.webp` |
| AI original, SVG | `https://logos.marketmaker.cc/ai-logos/<slug>.svg` |
| AI thumbnail, 96px WebP | `https://logos.marketmaker.cc/ai-logos/sm/<slug>.webp` |

Take the exact original file name from `data/coins.json`, `data/exchanges.json`, or `data/ai.json` (or from the icon panel on the site). AI originals are always SVGs.

```html
<img src="https://logos.marketmaker.cc/coin-logos/btc.png" alt="Bitcoin" width="48" height="48">
```

logos.marketmaker.cc is also where you browse, search and download. Do not copy icons into other repositories. See the [embedding guide](docs/EMBED.md) and [logo notice](LICENSE-NOTICE.md).

## Deploy

Build the site and run the tests and typecheck first. Set `CLOUDFLARE_API_TOKEN` for the Cloudflare account that owns `listingapis-logos` and the `marketmaker.cc` zone before running the deploy command.

```sh
bun x wrangler@latest deploy
```

Wrangler configures the `icons-marketmaker-cc` Worker, the `LOGOS` R2 binding, the static site and the `logos.marketmaker.cc` and `icons.marketmaker.cc` custom domains. After deployment, check `/`, `/index/coins.json`, and `/coin-logos/btc.png`.
