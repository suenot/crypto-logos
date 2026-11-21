# Embed coin and exchange icons

Embed logos from `https://logos.marketmaker.cc`. It serves the Cloudflare R2 bucket `listingapis-logos` under the same key paths the listing project uses (`logos.listingapis.com/...` keeps working with identical paths). Do not invent other URLs, do not copy files into your project, and do not use other logo sources.

Base: `https://logos.marketmaker.cc`

| What | Path |
| --- | --- |
| Coin original | `/coin-logos/<lowercase-ticker>.<ext>` |
| Coin thumbnail, 96px WebP | `/coin-logos/sm/<lowercase-ticker>.webp` |
| Exchange original | `/exchange-logos/<file>` |
| Exchange thumbnail, 96px WebP | `/exchange-logos/sm/<slug>.webp` |

- The coin file name is the lowercase ticker. Tickers with special characters are URL-encoded (`$TRUMP`, CJK symbols).
- The extension of an original differs per file (`.png`, `.jpg`, `.webp`, `.svg`). Read the exact `file` from `data/coins.json` or `data/exchanges.json` in this repository, or copy it from the panel on logos.marketmaker.cc. Thumbnails are always `.webp`.
- `.svg` works for every logo: `/coin-logos/btc.svg` returns a real vector when we have one (283 coins, source spothq/cryptocurrency-icons, CC0, list in `data/svg.json`). For all other logos, the same `.svg` URL returns the raster original with its real `Content-Type` (`image/png`, `image/jpeg`). Browsers show both in `<img>`. Add vectors with `bun scripts/sync-svg.ts`.
- To see how the listing project builds these URLs, read `~/projects/trading/listing`.

**HTML**

```html
<img src="https://logos.marketmaker.cc/coin-logos/btc.png" alt="Bitcoin" width="48" height="48">
```

**React**

```jsx
<img src={"https://logos.marketmaker.cc/exchange-logos/binance.jpg"} alt="Binance" width={48} height={48} />
```

**Markdown**

```md
![Bitcoin](https://logos.marketmaker.cc/coin-logos/btc.png)
```

## About logos.marketmaker.cc

The site is for browsing, searching and downloading (single files, or the whole library as a ZIP from GitHub). Its Worker also serves same-origin helper routes that the page uses to download files, `/coin/{SYMBOL}?size=full|sm` and `/exchange/{slug}?size=full|sm`, plus `/index/coins.json` and `/index/exchanges.json`. These routes are not the embed scheme.
