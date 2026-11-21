# Changelog

This project follows Keep a Changelog and Semantic Versioning.

## [Unreleased]

### Added

- AI logo catalog and archive with SVG originals, 96px WebP thumbnails, and Worker download routes.
- Searchable coin and exchange gallery with downloads and embedding examples.
- Cloudflare Worker with an R2-backed icon API and SVG fallback.
- Read-only CDN sync for the repository archive and catalog.

### Changed

- Use ticker symbols for coin URLs and the original CDN filenames for the archive. Include image-bearing coins without CoinMarketCap metadata in the gallery.
