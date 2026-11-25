# Changelog

This project follows Keep a Changelog and Semantic Versioning.

## [Unreleased]

### Added

- Service logo catalog: 54 market data, news, on-chain, signal, broker, DEX, MCP registry and tool logos under `service-logos/`, a Services tab in the gallery, and `/service/{slug}` download routes.
- AI logo catalog and archive with SVG originals, 96px WebP thumbnails, and Worker download routes.
- Searchable coin and exchange gallery with downloads and embedding examples.
- Cloudflare Worker with an R2-backed icon API and SVG fallback.
- Read-only CDN sync for the repository archive and catalog.

### Changed

- Service logos now come from each brand's current site icon, checked by eye against the site: Alchemy, Alpaca, CCXT, Clear Street, CoinGecko, CoinMarketCap, Glama, Smithery, T-Bank and TradingView were replaced, FRED and SEC EDGAR added. Embedded SVG styles are inlined with the light theme; icons from sites that refuse scripted downloads are kept as exact copies in `sources/services/`.
- Use ticker symbols for coin URLs and the original CDN filenames for the archive. Include image-bearing coins without CoinMarketCap metadata in the gallery.
