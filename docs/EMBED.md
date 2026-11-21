# Embed coin, exchange, and AI icons

Embed logos from `https://logos.marketmaker.cc`. It serves the Cloudflare R2 bucket `listingapis-logos` under the same key paths the listing project uses (`logos.listingapis.com/...` keeps working with identical paths). Do not invent other URLs, do not copy files into your project, and do not use other logo sources.

Base: `https://logos.marketmaker.cc`

| What | Path |
| --- | --- |
| Coin original | `/coin-logos/<lowercase-ticker>.<ext>` |
| Coin thumbnail, 96px WebP | `/coin-logos/sm/<lowercase-ticker>.webp` |
| Exchange original | `/exchange-logos/<file>` |
| Exchange thumbnail, 96px WebP | `/exchange-logos/sm/<slug>.webp` |
| AI original, SVG | `/ai-logos/<slug>.svg` |
| AI thumbnail, 96px WebP | `/ai-logos/sm/<slug>.webp` |

- The coin file name is the lowercase ticker. Tickers with special characters are URL-encoded (`$TRUMP`, CJK symbols).
- Read the exact `file` from `data/coins.json`, `data/exchanges.json`, or `data/ai.json` in this repository, or copy it from the panel on logos.marketmaker.cc. AI originals are always `.svg`. Thumbnails are always `.webp`.
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

The site is for browsing, searching and downloading (single files, or the whole library as a ZIP from GitHub). The page uses same-origin download helpers `/coin/{SYMBOL}?size=full|sm`, `/exchange/{slug}?size=full|sm`, and `/ai/{slug}?size=full|sm`. The AI helper returns an SVG for `size=full` and defaults to the WebP thumbnail. Unknown AI slugs return an SVG monogram.

The site serves compact catalogs at `/index/coins.json`, `/index/exchanges.json`, and `/index/ai.json`. Use the storage paths in the table for embeds.
