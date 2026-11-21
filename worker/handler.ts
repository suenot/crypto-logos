import type { Coin, Exchange } from "../data/catalog";

interface IconObject {
  body: ReadableStream<Uint8Array>;
  size?: number;
  httpEtag?: string;
  httpMetadata?: { contentType?: string };
}

export interface IconBucket {
  get(key: string): Promise<IconObject | null>;
}

export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface Environment {
  LOGOS: IconBucket;
  ASSETS?: AssetsBinding;
}

export interface IconCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

interface ResolvedIcon {
  original: string;
  thumbnail: string;
  label: string;
  exactSymbol: boolean;
}

const exactCache = "public, max-age=31536000, immutable";
const aliasCache = "public, max-age=86400";
const fallbackCache = "public, max-age=300";
const allowedExtensions = new Set(["webp", "png", "jpg", "svg"]);

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function contentType(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "svg": return "image/svg+xml";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    case "avif": return "image/avif";
    default: return "application/octet-stream";
  }
}

function monogram(label: string): string {
  const words = label.normalize("NFKC").toUpperCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const [first = "?", second] = words;
  const initials = second
    ? `${Array.from(first)[0]}${Array.from(second)[0]}`
    : Array.from(first).slice(0, 2).join("");
  let hash = 2166136261;
  for (const character of label) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  const hue = (hash >>> 0) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="${initials}"><rect width="96" height="96" rx="20" fill="hsl(${hue} 49% 37%)"/><text x="48" y="50" fill="white" font-family="system-ui,sans-serif" font-size="30" font-weight="700" text-anchor="middle" dominant-baseline="central">${initials}</text></svg>`;
}

function fallback(label: string): Response {
  return new Response(monogram(label), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": fallbackCache,
      "Content-Type": "image/svg+xml; charset=utf-8",
      "x-icons-fallback": "1",
    },
  });
}

function withCors(response: Response): Response {
  const copy = new Response(response.body, response);
  copy.headers.set("Access-Control-Allow-Origin", "*");
  return copy;
}

function bestRank(coin: Coin): number {
  return coin.rank ?? Number.POSITIVE_INFINITY;
}

function setBest(map: Map<string, Coin>, key: string, candidate: Coin): void {
  if (!key) return;
  const current = map.get(key);
  if (!current || bestRank(candidate) < bestRank(current)) map.set(key, candidate);
}

export function createHandler(coins: Coin[], exchanges: Exchange[], cache?: IconCache) {
  const bySymbol = new Map<string, Coin>();
  const bySlug = new Map<string, Coin>();
  for (const coin of coins) {
    setBest(bySymbol, coin.symbol.toLowerCase(), coin);
    if (coin.slug) setBest(bySlug, coin.slug.toLowerCase(), coin);
  }
  const byExchange = new Map(exchanges.map((exchange) => [exchange.slug.toLowerCase(), exchange]));

  return async function handle(request: Request, env: Environment): Promise<Response> {
    if (request.method !== "GET") return jsonError(405, "Method not allowed");

    const url = new URL(request.url);
    // Storage paths, identical to the R2 keys: /coin-logos/btc.png, /exchange-logos/sm/binance.webp
    if (/^\/(coin|exchange)-logos\//.test(url.pathname)) {
      let objectKey: string;
      try {
        objectKey = decodeURIComponent(url.pathname.slice(1));
      } catch {
        return jsonError(400, "Invalid path");
      }
      if (objectKey.split("/").some((part) => part === "" || part === "." || part === "..") || /[\\\u0000-\u001f]/.test(objectKey)) {
        return jsonError(404, "Not found");
      }
      const object = await env.LOGOS.get(objectKey);
      if (!object) return jsonError(404, "Not found");
      const headers = new Headers({
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": aliasCache,
        "Content-Type": object.httpMetadata?.contentType ?? contentType(objectKey),
        "Vary": "Accept-Encoding",
      });
      if (object.size !== undefined) headers.set("Content-Length", String(object.size));
      if (object.httpEtag) headers.set("ETag", object.httpEtag);
      return new Response(object.body, { headers });
    }

    const coinMatch = /^\/coin\/([^/]+)$/.exec(url.pathname);
    const exchangeMatch = /^\/exchange\/([^/]+)$/.exec(url.pathname);
    if (!coinMatch && !exchangeMatch) {
      if (!env.ASSETS) return jsonError(404, "Not found");
      const asset = await env.ASSETS.fetch(request);
      return asset.status === 404 ? jsonError(404, "Not found") : withCors(asset);
    }

    const requestedSize = url.searchParams.get("size");
    if (requestedSize !== null && requestedSize !== "sm" && requestedSize !== "full") {
      return jsonError(400, "size must be sm or full");
    }

    let key: string;
    try {
      key = decodeURIComponent((coinMatch ?? exchangeMatch)![1]);
    } catch {
      return jsonError(400, "Invalid icon key");
    }
    if (/[/\\\u0000-\u001f]/.test(key)) return jsonError(404, "Not found");
    const knownKey = coinMatch ? bySymbol.has(key.toLowerCase()) : byExchange.has(key.toLowerCase());
    const extensionMatch = knownKey ? null : /^(.*)\.([a-z]+)$/i.exec(key);
    let extension: string | undefined;
    if (extensionMatch) {
      extension = extensionMatch[2].toLowerCase();
      if (!allowedExtensions.has(extension)) return jsonError(404, "Not found");
      key = extensionMatch[1];
    }
    if (!key) return jsonError(404, "Not found");

    let icon: ResolvedIcon | undefined;
    if (coinMatch) {
      const symbol = bySymbol.get(key.toLowerCase());
      const coin = symbol ?? bySlug.get(key.toLowerCase());
      if (coin) {
        icon = {
          original: `coin-logos/${coin.file}`,
          thumbnail: `coin-logos/sm/${coin.sm}`,
          label: coin.symbol,
          exactSymbol: Boolean(symbol),
        };
      }
    } else {
      const exchange = byExchange.get(key.toLowerCase());
      if (exchange) {
        icon = {
          original: `exchange-logos/${exchange.file}`,
          thumbnail: `exchange-logos/sm/${exchange.sm}`,
          label: exchange.name,
          exactSymbol: false,
        };
      }
    }

    const cached = await cache?.match(request);
    if (cached) return cached;
    if (!icon) {
      const response = fallback(key);
      await cache?.put(request, response.clone());
      return response;
    }

    const size = requestedSize ?? (extension && extension !== "webp" ? "full" : "sm");
    const primary = size === "sm" ? icon.thumbnail : icon.original;
    const primaryObject = await env.LOGOS.get(primary);
    const object = primaryObject ?? (size === "sm" ? await env.LOGOS.get(icon.original) : null);
    if (!object) {
      const response = fallback(icon.label);
      await cache?.put(request, response.clone());
      return response;
    }

    const filename = primaryObject ? primary : icon.original;
    const headers = new Headers({
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": primaryObject ? (icon.exactSymbol ? exactCache : aliasCache) : fallbackCache,
      "Content-Type": object.httpMetadata?.contentType ?? contentType(filename),
      "Vary": "Accept-Encoding",
    });
    if (object.size !== undefined) headers.set("Content-Length", String(object.size));
    if (object.httpEtag) headers.set("ETag", object.httpEtag);
    const response = new Response(object.body, { headers });
    await cache?.put(request, response.clone());
    return response;
  };
}
