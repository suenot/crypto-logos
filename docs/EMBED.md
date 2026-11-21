# Embed coin and exchange icons

Embed icons from the Cloudflare R2 storage that the listing project already uses. Do not invent other URLs, do not copy files into your project, and do not use other icon sources.

Base: `https://logos.listingapis.com`

| What | Path |
| --- | --- |
| Coin original | `/coin-logos/<lowercase-ticker>.<ext>` |
| Coin thumbnail, 96px WebP | `/coin-logos/sm/<lowercase-ticker>.webp` |
| Exchange original | `/exchange-logos/<file>` |
| Exchange thumbnail, 96px WebP | `/exchange-logos/sm/<slug>.webp` |

- The coin file name is the lowercase ticker. Tickers with special characters are URL-encoded (`$TRUMP`, CJK symbols).
- The extension of an original differs per file (`.png`, `.jpg`, `.webp`, `.svg`). Read the exact `file` from `data/coins.json` or `data/exchanges.json` in this repository, or copy it from the icon panel on icons.marketmaker.cc. Thumbnails are always `.webp`.
- To see how the listing project builds these URLs, read `~/projects/trading/listing`.

**HTML**

```html
<img src="https://logos.listingapis.com/coin-logos/btc.png" alt="Bitcoin" width="48" height="48">
```

**React**

```jsx
<img src={"https://logos.listingapis.com/exchange-logos/binance.jpg"} alt="Binance" width={48} height={48} />
```

**Markdown**

```md
![Bitcoin](https://logos.listingapis.com/coin-logos/btc.png)
```

## About icons.marketmaker.cc

The site is for browsing, searching and downloading (single files, or the whole library as a ZIP from GitHub). Its Worker also serves same-origin helper routes that the page uses to download files, `/coin/{SYMBOL}?size=full|sm` and `/exchange/{slug}?size=full|sm`, plus `/index/coins.json` and `/index/exchanges.json`. These routes are not the embed scheme.
