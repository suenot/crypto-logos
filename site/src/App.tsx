import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { fileStem, type CoinRow, type ExchangeRow, type Logo } from '../../data/catalog';
import logoSvg from './logo.svg?raw';

const REPO_URL = 'https://github.com/suenot/crypto-logos';
const ZIP_URL = 'https://github.com/suenot/crypto-logos/archive/refs/heads/main.zip';
// Canonical storage. Every project embeds icons from these exact paths (the same ones the listing project uses).
const STORE = 'https://logos.marketmaker.cc';
const ROW_HEIGHT = 112;
const GAP = 8;

type Coin = Logo & { kind: 'coin'; symbol: string; name?: string };
type Exchange = Logo & { kind: 'exchange'; slug: string; name: string };
type Icon = Coin | Exchange;
type SnippetKind = 'html' | 'react' | 'markdown' | 'url';

const label = (icon: Icon) => (icon.kind === 'coin' ? icon.symbol : icon.name);
const fullName = (icon: Icon) => (icon.kind === 'coin' ? icon.name ?? icon.symbol : icon.name);
const key = (icon: Icon) => (icon.kind === 'coin' ? icon.symbol : icon.slug);

/** Exact storage URL: original file, or the 96px WebP thumbnail. */
function storeUrl(icon: Icon, small: boolean): string {
  return `${STORE}/${icon.kind}-logos/${small ? 'sm/' : ''}${encodeURIComponent(small ? icon.sm : icon.file)}`;
}

const svgKey = (icon: Icon) => (icon.kind === 'coin' ? fileStem(icon.file).toLowerCase() : '');

/** Same-origin download route (the storage domain sends no CORS headers, so blobs come through our Worker). */
function downloadRoute(icon: Icon, small: boolean): string {
  return `/${icon.kind}/${encodeURIComponent(key(icon))}?size=${small ? 'sm' : 'full'}`;
}

const attr = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

function snippet(icon: Icon, kind: SnippetKind): string {
  const url = storeUrl(icon, false);
  const name = fullName(icon);
  if (kind === 'url') return url;
  if (kind === 'html') return `<img src="${url}" alt="${attr(name)}" width="48" height="48">`;
  if (kind === 'react') return `<img src={${JSON.stringify(url)}} alt={${JSON.stringify(name)}} width={48} height={48} />`;
  return `![${name.replaceAll(']', '\\]')}](${url})`;
}

async function asWebp96(source: Blob): Promise<Blob> {
  const sourceUrl = URL.createObjectURL(source);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not read the source image'));
      image.src = sourceUrl;
    });
    if (source.type === 'image/webp' && image.naturalWidth === 96) return source;
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('WebP conversion is unavailable in this browser');
    const scale = Math.min(96 / image.naturalWidth, 96 / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (96 - width) / 2, (96 - height) / 2, width, height);
    const converted = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.92));
    if (converted?.type !== 'image/webp') throw new Error('WebP conversion is unavailable in this browser');
    return converted;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

const Svg = (props: { d: string; class?: string }) => (
  <svg class={props.class} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={props.d} /></svg>
);
const ICON_COPY = 'M9 9h10v10H9zM5 15V5h10';
const ICON_DOWN = 'M12 4v11m0 0-4-4m4 4 4-4M5 20h14';
const ICON_SEARCH = 'm21 21-4.3-4.3M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z';
const ICON_CLOSE = 'M6 6l12 12M18 6 6 18';

function App() {
  const [coins, setCoins] = createSignal<Coin[]>([]);
  const [exchanges, setExchanges] = createSignal<Exchange[]>([]);
  const [svgStems, setSvgStems] = createSignal<Set<string>>(new Set());
  const [loaded, setLoaded] = createSignal(false);
  const [loadError, setLoadError] = createSignal('');
  const [tab, setTab] = createSignal<'coins' | 'exchanges'>('coins');
  const [query, setQuery] = createSignal('');
  const [selected, setSelected] = createSignal<Icon | null>(null);
  const [sheetOpen, setSheetOpen] = createSignal(false);
  const [snippetKind, setSnippetKind] = createSignal<SnippetKind>('html');
  const [feedback, setFeedback] = createSignal('');
  const [busy, setBusy] = createSignal<string | null>(null);
  const [scrollTop, setScrollTop] = createSignal(0);
  const [gridWidth, setGridWidth] = createSignal(700);
  const [gridHeight, setGridHeight] = createSignal(560);
  const [light, setLight] = createSignal(false);
  const [stuck, setStuck] = createSignal(false);
  const [heroKind, setHeroKind] = createSignal<'coin' | 'exchange'>('coin');
  const [heroText, setHeroText] = createSignal('btc');
  const [heroIcon, setHeroIcon] = createSignal<Icon | null>(null);
  let gridElement: HTMLDivElement | undefined;
  let feedbackTimer = 0;

  const filtered = createMemo<Icon[]>(() => {
    const term = query().trim().toLowerCase();
    const all: Icon[] = tab() === 'coins' ? coins() : exchanges();
    if (!term) return all;
    return all.filter((icon) => {
      const fields = icon.kind === 'coin' ? [icon.symbol, icon.name] : [icon.name, icon.slug];
      return fields.some((field) => field?.toLowerCase().includes(term));
    });
  });

  const columns = createMemo(() => Math.max(3, Math.floor((gridWidth() + GAP) / (92 + GAP))));
  const rowCount = createMemo(() => Math.ceil(filtered().length / columns()));
  const firstRow = createMemo(() => Math.max(0, Math.floor(scrollTop() / ROW_HEIGHT) - 2));
  const lastRow = createMemo(() => Math.min(rowCount(), Math.ceil((scrollTop() + gridHeight()) / ROW_HEIGHT) + 2));
  const visibleRows = createMemo(() => Array.from({ length: Math.max(0, lastRow() - firstRow()) }, (_, i) => firstRow() + i));
  const rowIcons = (row: number) => filtered().slice(row * columns(), (row + 1) * columns());

  createEffect(() => {
    tab();
    query();
    if (gridElement) gridElement.scrollTop = 0;
    setScrollTop(0);
  });

  createEffect(() => {
    if (!sheetOpen()) return;
    const previous = document.body.style.overflow;
    if (window.matchMedia('(max-width: 1000px)').matches) document.body.style.overflow = 'hidden';
    onCleanup(() => { document.body.style.overflow = previous; });
  });

  function pick(icon: Icon) {
    setSelected(icon);
    setFeedback('');
    setSheetOpen(true);
  }

  function say(message: string) {
    setFeedback(message);
    window.clearTimeout(feedbackTimer);
    feedbackTimer = window.setTimeout(() => setFeedback(''), 2600);
  }

  onMount(() => {
    const stored = (() => { try { return localStorage.getItem('theme'); } catch { return null; } })();
    setLight((stored ?? document.documentElement.dataset.theme) === 'light');

    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setSheetOpen(false); };
    const onScroll = () => setStuck(window.scrollY > 8);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const observer = new ResizeObserver(([entry]) => {
      setGridWidth(entry.contentRect.width);
      setGridHeight(entry.contentRect.height);
    });
    if (gridElement) observer.observe(gridElement);

    let cancelled = false;
    const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

    async function cycle(steps: { icon: Icon }[]) {
      let index = 0;
      while (!cancelled) {
        await sleep(2800);
        if (document.hidden) continue;
        index = (index + 1) % steps.length;
        const next = steps[index].icon;
        setHeroIcon(null);
        while (heroText().length > 0 && !cancelled) { setHeroText((text) => text.slice(0, -1)); await sleep(34); }
        setHeroKind(next.kind);
        for (const char of next.file) { if (cancelled) return; setHeroText((text) => text + char); await sleep(70); }
        setHeroIcon(next);
      }
    }

    fetch('/index/svg.json').then((r) => (r.ok ? r.json() : [])).then((list: string[]) => setSvgStems(new Set(list))).catch(() => undefined);

    Promise.all([
      fetch('/index/coins.json').then((response) => {
        if (!response.ok) throw new Error(`Coin index returned ${response.status}`);
        return response.json() as Promise<CoinRow[]>;
      }),
      fetch('/index/exchanges.json').then((response) => {
        if (!response.ok) throw new Error(`Exchange index returned ${response.status}`);
        return response.json() as Promise<ExchangeRow[]>;
      })
    ]).then(([coinRows, exchangeRows]) => {
      const coinList: Coin[] = coinRows.map(([symbol, file, name]) => ({ kind: 'coin', symbol, name, file, sm: `${fileStem(file)}.webp` }));
      const exchangeList: Exchange[] = exchangeRows.map(([slug, name, file, sm]) => ({ kind: 'exchange', slug, name, file, sm }));
      setCoins(coinList);
      setExchanges(exchangeList);
      setLoaded(true);
      const btc = coinList.find((c) => c.symbol === 'BTC') ?? coinList[0];
      setSelected(btc);
      setHeroIcon(btc);
      setHeroText(btc.file);
      const wanted: Icon[] = [
        btc,
        ...['ETH', 'SOL'].map((s) => coinList.find((c) => c.symbol === s)),
        exchangeList.find((e) => e.slug === 'binance'),
        coinList.find((c) => c.symbol === 'DOGE'),
        exchangeList.find((e) => e.slug === 'kraken'),
        coinList.find((c) => c.symbol === 'XRP')
      ].filter((item): item is Icon => Boolean(item));
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && wanted.length > 1) void cycle(wanted.map((icon) => ({ icon })));
    }).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Could not load the icon index'));

    onCleanup(() => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll);
    });
  });

  function toggleTheme() {
    const next = light() ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* storage unavailable */ }
    setLight(next === 'light');
  }

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value);
      say(`${what} copied`);
    } catch {
      say('Clipboard is blocked in this browser');
    }
  }

  async function download(icon: Icon, small: boolean, vector = false) {
    setBusy(vector ? 'svg' : small ? 'webp' : 'original');
    try {
      const response = await fetch(vector ? `/coin-logos/${encodeURIComponent(svgKey(icon))}.svg` : downloadRoute(icon, small));
      if (!response.ok) throw new Error(`Download failed with status ${response.status}`);
      const generated = response.headers.get('x-icons-fallback') === '1';
      const source = await response.blob();
      const blob = small && !vector ? await asWebp96(source) : source;
      const filename = vector ? `${svgKey(icon)}.svg` : small ? icon.sm : generated ? `${fileStem(icon.file)}.svg` : icon.file;
      const link = document.createElement('a');
      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      say(`${filename} downloaded`);
    } catch (error) {
      say(error instanceof Error ? error.message : 'Download failed');
    } finally {
      setBusy(null);
    }
  }

  const heroName = () => `/${heroKind()}-logos/`;

  return (
    <>
      <a class="skip" href="#browse">Skip to icons</a>
      <header class="nav" data-stuck={stuck()}>
        <div class="wrap">
          <a class="brand" href="#top" aria-label="Icons home">
            <span class="brand-logo" innerHTML={logoSvg} />
            <span>logos<i>.marketmaker.cc</i></span>
          </a>
          <nav class="nav-links" aria-label="Primary">
            <a href="#browse">Browse</a>
            <a href="#use">Use</a>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
          </nav>
          <div class="nav-end">
            <button class="icon-btn theme-toggle" type="button" onClick={toggleTheme} aria-label={light() ? 'Switch to dark theme' : 'Switch to light theme'}>
              <Show when={light()} fallback={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" /></svg>}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.4A8.5 8.5 0 0 1 9.6 3.5 8.5 8.5 0 1 0 20.5 14.4Z" /></svg>
              </Show>
            </button>
            <a class="btn btn--primary btn--sm" href={ZIP_URL}><Svg d={ICON_DOWN} />Download ZIP</a>
          </div>
        </div>
      </header>

      <main id="top">
        <section class="hero wrap" aria-labelledby="hero-title">
          <h1 id="hero-title" class="sr">Coin and exchange icons for trading</h1>
          <div class="hero-grid">
            <div class="hero-text">
              <p class="host mono" aria-hidden="true">logos.marketmaker.cc</p>
              <p class="path mono" aria-hidden="true"><span class="path-fixed">{heroName()}</span><span class="path-slot">{heroText()}</span><span class="caret" /></p>
              <p class="lede">Every coin and exchange logo we use, in one place. Free to embed from Cloudflare, no keys, no sign-up.</p>
              <div class="cta">
                <a class="btn btn--primary" href={ZIP_URL}><Svg d={ICON_DOWN} />Download ZIP</a>
                <a class="btn btn--ghost" href={REPO_URL} target="_blank" rel="noopener noreferrer">View on GitHub</a>
              </div>
              <dl class="facts mono">
                <div><dt class="sr">Coins</dt><dd><b>{loaded() ? coins().length.toLocaleString() : '…'}</b> coins</dd></div>
                <div><dt class="sr">Exchanges</dt><dd><b>{loaded() ? exchanges().length.toLocaleString() : '…'}</b> exchanges</dd></div>
                <div><dt class="sr">Formats</dt><dd>original + 96px WebP</dd></div>
              </dl>
            </div>
            <div class="hero-plate" aria-hidden="true">
              <For each={[heroIcon()]}>{(icon) => <Show when={icon}>{(current) => <img class="pop" src={storeUrl(current(), false)} alt="" />}</Show>}</For>
            </div>
          </div>
        </section>

        <section class="browse wrap" id="browse" aria-labelledby="browse-title">
          <div class="browse-head">
            <h2 id="browse-title">Browse</h2>
            <div class="tools">
              <div class="chips" role="group" aria-label="Icon type">
                <button class="chip" type="button" aria-pressed={tab() === 'coins'} onClick={() => setTab('coins')}>Coins</button>
                <button class="chip" type="button" aria-pressed={tab() === 'exchanges'} onClick={() => setTab('exchanges')}>Exchanges</button>
              </div>
              <label class="search">
                <Svg d={ICON_SEARCH} />
                <span class="sr">Search icons</span>
                <input type="search" placeholder={tab() === 'coins' ? 'Search ticker or name' : 'Search exchange'} value={query()} autocomplete="off" spellcheck={false}
                  onInput={(event) => setQuery(event.currentTarget.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter' && filtered()[0]) pick(filtered()[0]); }} />
              </label>
            </div>
          </div>
          <p class="count mono" role="status" aria-live="polite">
            <Show when={!loadError()} fallback={loadError()}>{loaded() ? `${filtered().length.toLocaleString()} ${tab()}${tab() === 'coins' ? ', ranked by market cap' : ''}` : 'Loading…'}</Show>
          </p>

          <div class="layout">
            <div class="pane">
              <div class="scroller" ref={gridElement} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
                <Show when={loaded() && filtered().length === 0}><p class="empty">Nothing matches “{query()}”. Check the spelling or switch tabs.</p></Show>
                <div class="space" style={{ height: `${rowCount() * ROW_HEIGHT}px` }}>
                  <For each={visibleRows()}>{(row) => (
                    <div class="row" style={{ top: `${row * ROW_HEIGHT}px`, 'grid-template-columns': `repeat(${columns()}, minmax(0, 1fr))` }}>
                      <For each={rowIcons(row)}>{(icon) => (
                        <button class="tile" type="button" aria-pressed={selected() === icon} title={fullName(icon)} onClick={() => pick(icon)}>
                          <span class="plate"><img src={storeUrl(icon, true)} alt="" width="44" height="44" loading="lazy"
                            onError={(event) => { const fallback = downloadRoute(icon, true); if (!event.currentTarget.src.endsWith(fallback)) event.currentTarget.src = fallback; }} /></span>
                          <span class="tile-name mono">{label(icon)}</span>
                        </button>
                      )}</For>
                    </div>
                  )}</For>
                </div>
              </div>
            </div>

            <button class="backdrop" type="button" tabIndex={-1} aria-hidden="true" data-open={sheetOpen()} onClick={() => setSheetOpen(false)} />
            <aside class="inspector" data-open={sheetOpen()} aria-label="Selected icon">
              <Show when={selected()} fallback={<p class="empty-inspector">Pick an icon to see its URL and downloads.</p>}>{(icon) => (
                <>
                  <button class="icon-btn close" type="button" onClick={() => setSheetOpen(false)} aria-label="Close"><Svg d={ICON_CLOSE} /></button>
                  <div class="insp-plate">
                    <For each={[icon()]}>{(current) => <img class="pop" src={storeUrl(current, false)} alt={`${fullName(current)} logo`}
                      onError={(event) => { const fallback = downloadRoute(current, false); if (!event.currentTarget.src.endsWith(fallback)) event.currentTarget.src = fallback; }} />}</For>
                  </div>
                  <h3>{fullName(icon())}</h3>
                  <p class="insp-meta mono">{icon().kind === 'coin' ? `coin, ticker ${(icon() as Coin).symbol}` : `exchange, slug ${(icon() as Exchange).slug}`}</p>

                  <div class="insp-actions">
                    <button class="btn btn--primary" type="button" disabled={busy() !== null} onClick={() => void download(icon(), false)}><Svg d={ICON_DOWN} />Original</button>
                    <button class="btn btn--ghost" type="button" disabled={busy() !== null} onClick={() => void download(icon(), true)}><Svg d={ICON_DOWN} />WebP 96px</button>
                    <Show when={svgStems().has(svgKey(icon()))}>
                      <button class="btn btn--ghost" type="button" disabled={busy() !== null} onClick={() => void download(icon(), false, true)}><Svg d={ICON_DOWN} />SVG vector</button>
                    </Show>
                  </div>

                  <div class="snip">
                    <div class="chips" role="group" aria-label="Snippet format">
                      <For each={[['url', 'URL'], ['html', 'HTML'], ['react', 'React'], ['markdown', 'Markdown']] as [SnippetKind, string][]}>{([id, text]) => (
                        <button class="chip chip--sm" type="button" aria-pressed={snippetKind() === id} onClick={() => setSnippetKind(id)}>{text}</button>
                      )}</For>
                    </div>
                    <div class="code">
                      <code class="mono">{snippet(icon(), snippetKind())}</code>
                      <button class="btn btn--ghost btn--sm" type="button" onClick={() => void copy(snippet(icon(), snippetKind()), 'Snippet')}><Svg d={ICON_COPY} />Copy</button>
                    </div>
                    <p class="thumb mono">96px WebP: <span>{storeUrl(icon(), true)}</span></p>
                    <Show when={svgStems().has(svgKey(icon()))}><p class="thumb mono">Vector: <span>{`${STORE}/coin-logos/${svgKey(icon())}.svg`}</span></p></Show>
                  </div>
                  <p class="insp-status" role="status" aria-live="polite">{feedback()}</p>
                </>
              )}</Show>
            </aside>
          </div>
        </section>

        <section class="use wrap" id="use" aria-labelledby="use-title">
          <div class="use-head">
            <h2 id="use-title">Use these paths in every project</h2>
            <p>The files already live in our Cloudflare R2 bucket and the listing project loads them from there. Other projects reuse the same URLs, so there is one copy to maintain. Do not copy icons into another repository.</p>
          </div>
          <ul class="paths">
            <li><code class="mono">logos.marketmaker.cc/coin-logos/<b>btc.png</b></code><p>Coin original. The file name is the lowercase ticker and the extension is the stored one, so take it from the icon panel.</p></li>
            <li><code class="mono">logos.marketmaker.cc/coin-logos/sm/<b>btc.webp</b></code><p>Coin thumbnail, 96px WebP. Use it for lists and tables.</p></li>
            <li><code class="mono">logos.marketmaker.cc/exchange-logos/<b>binance.png</b></code><p>Exchange original, named by slug.</p></li>
            <li><code class="mono">logos.marketmaker.cc/exchange-logos/sm/<b>binance.webp</b></code><p>Exchange thumbnail, 96px WebP.</p></li>
          </ul>
        </section>
      </main>

      <footer class="foot wrap">
        <p>Logos belong to their owners and are shown only to identify the listed assets.</p>
        <div><a href="https://marketmaker.cc" target="_blank" rel="noopener noreferrer">marketmaker.cc</a><a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a></div>
      </footer>
    </>
  );
}

export default App;
