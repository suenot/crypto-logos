import { describe, expect, test } from "bun:test";
import type { Coin, Exchange } from "../data/catalog";
import { createHandler, type Environment, type IconCache } from "./handler";

const coins: Coin[] = [
  { symbol: "ETH", stem: "eth", name: "Ether", slug: "ethereum", rank: 3, cmc: 4444, file: "eth.png", sm: "eth.webp" },
  { symbol: "OTHER", stem: "other", slug: "eth", rank: 1, file: "other.png", sm: "other.webp" },
  { symbol: "4444", stem: "4444", file: "4444.jpg", sm: "4444.webp" },
  { symbol: "$TRUMP", stem: "$trump", file: "$trump.jpg", sm: "$trump.webp" },
  { symbol: "龙LONG", stem: "龙long", file: "龙long.png", sm: "龙long.webp" },
  { symbol: "ETH.PNG", stem: "eth.png", file: "eth.png.webp", sm: "eth.png.webp" },
];
const exchanges: Exchange[] = [
  { slug: "example-exchange", name: "Example Exchange", file: "example-exchange.png", sm: "example-exchange.webp" },
];

function setup(files: Record<string, string>) {
  const reads: string[] = [];
  const env: Environment = {
    LOGOS: {
      async get(key) {
        reads.push(key);
        const value = files[key];
        if (value === undefined) return null;
        return {
          body: new Response(value).body!,
          size: new TextEncoder().encode(value).length,
        };
      },
    },
    ASSETS: {
      async fetch(request) {
        return new URL(request.url).pathname === "/"
          ? new Response("homepage")
          : new Response("missing", { status: 404 });
      },
    },
  };
  return { env, reads };
}

describe("icon routes", () => {
  test("resolves symbols case-insensitively before slug aliases and defaults to the R2 thumbnail", async () => {
    const { env, reads } = setup({ "coin-logos/sm/eth.webp": "small" });
    const response = await createHandler(coins, exchanges)(new Request("https://icons.test/coin/eTh"), env);
    expect(await response.text()).toBe("small");
    expect(reads).toEqual(["coin-logos/sm/eth.webp"]);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  test("uses literal numeric tickers and decodes ticker special characters for R2", async () => {
    const { env, reads } = setup({
      "coin-logos/4444.jpg": "numeric",
      "coin-logos/sm/$trump.webp": "dollar",
      "coin-logos/龙long.png": "unicode",
    });
    const handle = createHandler(coins, exchanges);
    const numeric = await handle(new Request("https://icons.test/coin/4444?size=full"), env);
    const dollar = await handle(new Request("https://icons.test/coin/%24TrUmP.webp"), env);
    const unicode = await handle(new Request("https://icons.test/coin/%E9%BE%99LONG.png"), env);
    expect(await numeric.text()).toBe("numeric");
    expect(await dollar.text()).toBe("dollar");
    expect(await unicode.text()).toBe("unicode");
    expect(reads).toEqual(["coin-logos/4444.jpg", "coin-logos/sm/$trump.webp", "coin-logos/龙long.png"]);
    expect(numeric.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(numeric.headers.get("Content-Type")).toBe("image/jpeg");
    expect((await handle(new Request("https://icons.test/coin/id/4444"), env)).status).toBe(404);
  });

  test("looks up a complete ticker before interpreting its suffix as an extension", async () => {
    const { env, reads } = setup({ "coin-logos/sm/eth.png.webp": "dotted ticker" });
    const response = await createHandler(coins, exchanges)(new Request("https://icons.test/coin/eth.png"), env);
    expect(await response.text()).toBe("dotted ticker");
    expect(reads).toEqual(["coin-logos/sm/eth.png.webp"]);
  });

  test("explicit size overrides extension; image extensions otherwise select originals", async () => {
    const { env, reads } = setup({
      "coin-logos/eth.png": "full",
      "coin-logos/sm/eth.webp": "small",
    });
    const handle = createHandler(coins, exchanges);
    const original = await handle(new Request("https://icons.test/coin/ethereum.svg"), env);
    const thumbnail = await handle(new Request("https://icons.test/coin/ETH.jpg?size=sm"), env);
    const fullWebp = await handle(new Request("https://icons.test/coin/ETH.webp?size=full"), env);
    expect(await original.text()).toBe("full");
    expect(await thumbnail.text()).toBe("small");
    expect(await fullWebp.text()).toBe("full");
    expect(reads).toEqual(["coin-logos/eth.png", "coin-logos/sm/eth.webp", "coin-logos/eth.png"]);
    expect(original.headers.get("Content-Type")).toBe("image/png");
    expect(original.headers.get("Cache-Control")).toBe("public, max-age=86400");
  });

  test("serves exchanges and falls back to the original when R2 has no thumbnail", async () => {
    const { env, reads } = setup({ "exchange-logos/example-exchange.png": "exchange" });
    const response = await createHandler(coins, exchanges)(new Request("https://icons.test/exchange/EXAMPLE-EXCHANGE"), env);
    expect(await response.text()).toBe("exchange");
    expect(reads).toEqual(["exchange-logos/sm/example-exchange.webp", "exchange-logos/example-exchange.png"]);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
  });

  test("uses a monogram when full is requested and only the thumbnail exists", async () => {
    const { env, reads } = setup({ "coin-logos/sm/eth.webp": "small" });
    const response = await createHandler(coins, exchanges)(new Request("https://icons.test/coin/ETH?size=full"), env);
    expect(response.headers.get("x-icons-fallback")).toBe("1");
    expect(reads).toEqual(["coin-logos/eth.png"]);
  });

  test("generates a safe, briefly cached monogram for missing icons without reading guessed R2 keys", async () => {
    const { env, reads } = setup({});
    const handle = createHandler(coins, exchanges);
    const unknown = await handle(new Request("https://icons.test/coin/999999"), env);
    expect(unknown.status).toBe(200);
    expect(unknown.headers.get("x-icons-fallback")).toBe("1");
    expect(unknown.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(await unknown.text()).toContain("<svg");
    expect(reads).toEqual([]);
    const missing = await handle(new Request("https://icons.test/coin/ETH"), env);
    expect(missing.headers.get("x-icons-fallback")).toBe("1");
    expect(reads).toEqual(["coin-logos/sm/eth.webp", "coin-logos/eth.png"]);
    const malicious = await handle(new Request("https://icons.test/exchange/%3Cscript%3E"), env);
    expect(await malicious.text()).not.toContain("<script>");
  });

  test("uses the Cache API for repeat requests", async () => {
    const { env, reads } = setup({ "coin-logos/sm/eth.webp": "small" });
    const responses = new Map<string, Response>();
    const cache: IconCache = {
      async match(request) { return responses.get(request.url)?.clone(); },
      async put(request, response) { responses.set(request.url, response.clone()); },
    };
    const handle = createHandler(coins, exchanges, cache);
    const request = new Request("https://icons.test/coin/ETH");
    expect(await (await handle(request, env)).text()).toBe("small");
    expect(await (await handle(request, env)).text()).toBe("small");
    expect(reads).toEqual(["coin-logos/sm/eth.webp"]);
  });

  test("passes through static assets and returns JSON for unknown assets and invalid sizes", async () => {
    const { env } = setup({});
    const handle = createHandler(coins, exchanges);
    const home = await handle(new Request("https://icons.test/"), env);
    expect(await home.text()).toBe("homepage");
    expect(home.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const absent = await handle(new Request("https://icons.test/other"), env);
    expect(absent.status).toBe(404);
    expect(absent.headers.get("Content-Type")).toContain("application/json");
    const invalidSize = await handle(new Request("https://icons.test/coin/ETH?size=large"), env);
    expect(invalidSize.status).toBe(400);
    const invalidExtension = await handle(new Request("https://icons.test/coin/ETH.bmp"), env);
    expect(invalidExtension.status).toBe(404);
  });
});
