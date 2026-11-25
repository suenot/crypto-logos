import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solid from 'vite-plugin-solid';
import { defineConfig, type Plugin } from 'vite';
import type { AiLogo, AiRow, Coin, CoinRow, Exchange, ExchangeRow, ServiceLogo, ServiceRow } from '../data/catalog';
import { createHandler, type Environment } from '../worker/handler';

const siteDirectory = fileURLToPath(new URL('.', import.meta.url));
const dataDirectory = path.resolve(siteDirectory, '../data');
const iconsDirectory = path.resolve(siteDirectory, '../icons');
const cdnOrigin = 'https://logos.listingapis.com';

type IndexKind = 'coins' | 'exchanges' | 'ai' | 'services';

async function readIndex<T>(kind: IndexKind): Promise<T[]> {
  return JSON.parse(await readFile(path.join(dataDirectory, `${kind}.json`), 'utf8'));
}

async function compactIndex(kind: IndexKind): Promise<string> {
  if (kind === 'services') {
    return JSON.stringify((await readIndex<ServiceLogo>('services')).map(({ slug, name, file, sm, kind: group }): ServiceRow => [slug, name, file, sm, group]));
  }
  if (kind === 'ai') {
    return JSON.stringify((await readIndex<AiLogo>('ai')).map(({ slug, name, file, sm, kind: group }): AiRow => [slug, name, file, sm, group]));
  }
  const rows = kind === 'coins'
    ? (await readIndex<Coin>('coins')).map(({ symbol, file, name }): CoinRow => name ? [symbol, file, name] : [symbol, file])
    : (await readIndex<Exchange>('exchanges')).map(({ slug, name, file, sm }): ExchangeRow => [slug, name, file, sm]);
  return JSON.stringify(rows);
}

type Next = (error?: unknown) => void;

async function serveIndex(request: IncomingMessage, response: ServerResponse, next: Next) {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  const match = /^\/index\/(coins|exchanges|ai|services)\.json$/.exec(pathname);
  if (!match || request.method !== 'GET') {
    next();
    return;
  }
  try {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.end(await compactIndex(match[1] as IndexKind));
  } catch (error) {
    next(error);
  }
}

async function createIconMiddleware() {
  const [coins, exchanges, ai, services] = await Promise.all([readIndex<Coin>('coins'), readIndex<Exchange>('exchanges'), readIndex<AiLogo>('ai'), readIndex<ServiceLogo>('services')]);
  const handle = createHandler(coins, exchanges, ai, undefined, services);
  // Local Vite uses the public CDN for coins and exchanges and the local icons/ folder for AI and service logos.
  // The deployed Worker reads the R2 binding.
  const env: Environment = {
    LOGOS: {
      async get(key) {
        const localGroup = /^(ai|service)-logos\/(sm\/)?/.exec(key);
        if (localGroup) {
          const folder = localGroup[1] === 'ai' ? 'ai' : 'services';
          const local = path.join(iconsDirectory, localGroup[2] ? `sm/${folder}/` : `${folder}/`, key.slice(localGroup[0].length));
          if (!local.startsWith(iconsDirectory + path.sep)) return null;
          try {
            const bytes = await readFile(local);
            return { body: new Blob([bytes]).stream(), size: bytes.length };
          } catch {
            return null;
          }
        }
        const encodedKey = key.split('/').map(encodeURIComponent).join('/');
        const upstream = await fetch(`${cdnOrigin}/${encodedKey}`);
        if (upstream.status === 404) return null;
        if (!upstream.ok || !upstream.body) throw new Error(`Logo CDN returned ${upstream.status}`);
        return {
          body: upstream.body,
          httpMetadata: { contentType: upstream.headers.get('content-type') ?? undefined }
        };
      }
    }
  };
  return async (request: IncomingMessage, response: ServerResponse, next: Next) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (!/^\/(coin|exchange|ai|service)(-logos)?\//.test(url.pathname)) {
      next();
      return;
    }
    try {
      const icon = await handle(new Request(url, { method: request.method }), env);
      response.statusCode = icon.status;
      icon.headers.forEach((value, key) => response.setHeader(key, value));
      response.end(Buffer.from(await icon.arrayBuffer()));
    } catch (error) {
      next(error);
    }
  };
}

function iconData(): Plugin {
  return {
    name: 'icon-data',
    async generateBundle() {
      for (const kind of ['coins', 'exchanges', 'ai', 'services'] as const) {
        this.emitFile({ type: 'asset', fileName: `index/${kind}.json`, source: await compactIndex(kind) });
      }
    },
    async configureServer(server) {
      server.middlewares.use(serveIndex);
      server.middlewares.use(await createIconMiddleware());
    },
    async configurePreviewServer(server) {
      server.middlewares.use(await createIconMiddleware());
    }
  };
}

export default defineConfig({
  root: siteDirectory,
  plugins: [solid(), iconData()],
  build: { outDir: path.join(siteDirectory, 'dist'), emptyOutDir: true },
  server: { host: '127.0.0.1' }
});
