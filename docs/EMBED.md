# Embed coin and exchange icons

Use `https://icons.marketmaker.cc` as the source for coin and exchange logos in all our trading projects. Link to the Cloudflare URLs and keep the original files in the icon collection.

| Path | Resolves |
| --- | --- |
| `/coin/BTC` or `/coin/4444` | Coin ticker symbol, case-insensitive |
| `/coin/%24TRUMP` or `/coin/%E9%BE%99LONG` | URL-encoded tickers `$TRUMP` and `龙LONG` |
| `/exchange/binance` | Exchange slug, case-insensitive |
| `/index/coins.json` | Compact gallery coin index |
| `/index/exchanges.json` | Compact gallery exchange index |

Use `encodeURIComponent(symbol)` when building a coin URL from a ticker. The Worker looks up the ticker first, then checks any available coin slug aliases. If a slug is shared, the best-ranked coin wins.

Requests default to the 96px-wide WebP. Use `?size=sm` for the small version or `?size=full` for the stored original. Optional suffixes are accepted. `.webp` selects the small version by default and `.png`, `.jpg`, and `.svg` select the original. The query parameter takes precedence and the response declares the actual image format in `Content-Type`. When only the original is available, a small request can return it. An unavailable icon returns a generated SVG and `x-icons-fallback: 1`. Unknown paths return JSON with HTTP 404.

**HTML**

```html
<img src="https://icons.marketmaker.cc/coin/BTC" alt="Bitcoin" width="48" height="48">
```

**React**

```jsx
<img src="https://icons.marketmaker.cc/exchange/binance" alt="Binance" width={48} height={48} />
```

**Markdown**

```md
![Bitcoin](https://icons.marketmaker.cc/coin/BTC)
```

Exact ticker image responses cache for one year and are immutable. Exchange and coin slug alias responses cache for one day. Fallback responses cache for five minutes. The icon and index endpoints allow cross-origin requests.
