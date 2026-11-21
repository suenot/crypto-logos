import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { fileStem, type CoinRow, type ExchangeRow, type Logo } from '../../data/catalog';

const REPO_URL = 'https://github.com/suenot/crypto-icons';
const ZIP_URL = 'https://github.com/suenot/crypto-icons/archive/refs/heads/main.zip';
const ICONS_ORIGIN = 'https://icons.marketmaker.cc';
const IMAGE_ORIGIN = 'https://logos.listingapis.com';
const ROW_HEIGHT = 146;
const GRID_GAP = 12;

type Coin = Logo & { kind: 'coin'; symbol: string; name?: string };
type Exchange = Logo & { kind: 'exchange'; slug: string; name: string };
type Icon = Coin | Exchange;

function iconName(icon: Icon): string {
  return icon.kind === 'coin' ? icon.name ?? icon.symbol : icon.name;
}

function iconMeta(icon: Icon): string | undefined {
  if (icon.kind === 'exchange') return icon.slug;
  return icon.name && icon.name !== icon.symbol ? icon.symbol : undefined;
}

function imageUrl(icon: Icon, small: boolean): string {
  return `${IMAGE_ORIGIN}/${icon.kind}-logos/${small ? 'sm/' : ''}${encodeURIComponent(small ? icon.sm : icon.file)}`;
}

function iconPath(icon: Icon): string {
  const key = icon.kind === 'coin' ? icon.symbol : icon.slug;
  return `/${icon.kind}/${encodeURIComponent(key)}`;
}

function publicUrl(icon: Icon): string {
  return `${ICONS_ORIGIN}${iconPath(icon)}`;
}

function htmlAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function examples(icon: Icon) {
  const url = publicUrl(icon);
  const name = iconName(icon);
  return {
    html: `<img src="${url}" alt="${htmlAttribute(name)}" width="48" height="48">`,
    react: `<img src="${url}" alt={${JSON.stringify(name)}} width={48} height={48} />`,
    markdown: `![${name.replaceAll(']', '\\]')}](${url})`
  };
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

function App() {
  const [coins, setCoins] = createSignal<Coin[]>([]);
  const [exchanges, setExchanges] = createSignal<Exchange[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [loadError, setLoadError] = createSignal('');
  const [tab, setTab] = createSignal<'coins' | 'exchanges'>('coins');
  const [query, setQuery] = createSignal('');
  const [selected, setSelected] = createSignal<Icon | null>(null);
  const [feedback, setFeedback] = createSignal('');
  const [busy, setBusy] = createSignal<string | null>(null);
  const [scrollTop, setScrollTop] = createSignal(0);
  const [gridWidth, setGridWidth] = createSignal(800);
  const [gridHeight, setGridHeight] = createSignal(560);
  const [dark, setDark] = createSignal(false);
  let gridElement: HTMLDivElement | undefined;
  let closeButton: HTMLButtonElement | undefined;
  let lastTrigger: HTMLButtonElement | undefined;

  const filtered = createMemo<Icon[]>(() => {
    const term = query().trim().toLowerCase();
    const all: Icon[] = tab() === 'coins' ? coins() : exchanges();
    if (!term) return all;
    return all.filter((icon) => {
      const fields = icon.kind === 'coin'
        ? [icon.symbol, icon.name]
        : [icon.name, icon.slug];
      return fields.some((field) => field?.toLowerCase().includes(term));
    });
  });

  const columns = createMemo(() => Math.max(2, Math.min(8, Math.floor((gridWidth() + GRID_GAP) / (126 + GRID_GAP)))));
  const rowCount = createMemo(() => Math.ceil(filtered().length / columns()));
  const firstVisibleRow = createMemo(() => Math.max(0, Math.floor(scrollTop() / ROW_HEIGHT) - 2));
  const lastVisibleRow = createMemo(() => Math.min(rowCount(), Math.ceil((scrollTop() + gridHeight()) / ROW_HEIGHT) + 2));
  const visibleRows = createMemo(() => {
    const first = firstVisibleRow();
    return Array.from({ length: Math.max(0, lastVisibleRow() - first) }, (_, offset) => first + offset);
  });
  const iconsInRow = (row: number) => filtered().slice(row * columns(), (row + 1) * columns());

  createEffect(() => {
    tab();
    query();
    if (gridElement) gridElement.scrollTop = 0;
    setScrollTop(0);
  });

  createEffect(() => {
    if (selected()) queueMicrotask(() => closeButton?.focus());
  });

  createEffect(() => {
    if (!selected()) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    onCleanup(() => { document.body.style.overflow = previousOverflow; });
  });

  function closePanel() {
    setSelected(null);
    queueMicrotask(() => lastTrigger?.focus());
  }

  onMount(() => {
    const preference = localStorage.getItem('icons-theme');
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = () => setDark(document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && media.matches));
    if (preference === 'dark' || preference === 'light') document.documentElement.dataset.theme = preference;
    updateSystemTheme();
    media.addEventListener('change', updateSystemTheme);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selected()) closePanel();
      if (event.key !== 'Tab' || !selected()) return;
      const controls = document.querySelectorAll<HTMLElement>('.detail-panel button:not(:disabled)');
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    const observer = new ResizeObserver(([entry]) => {
      setGridWidth(entry.contentRect.width);
      setGridHeight(entry.contentRect.height);
    });
    if (gridElement) observer.observe(gridElement);

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
      setCoins(coinRows.map(([symbol, file, name]) => ({ kind: 'coin', symbol, name, file, sm: `${fileStem(file)}.webp` })));
      setExchanges(exchangeRows.map(([slug, name, file, sm]) => ({ kind: 'exchange', slug, name, file, sm })));
      setLoaded(true);
    }).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Could not load the icon index'));

    onCleanup(() => {
      observer.disconnect();
      media.removeEventListener('change', updateSystemTheme);
      window.removeEventListener('keydown', onKeyDown);
    });
  });

  function toggleTheme() {
    const next = dark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('icons-theme', next);
    setDark(next === 'dark');
  }

  async function copy(value: string, description: string) {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(`${description} copied`);
    } catch {
      setFeedback('Clipboard access is unavailable');
    }
  }

  async function download(icon: Icon, small: boolean) {
    const label = small ? 'webp' : 'original';
    setBusy(label);
    setFeedback('');
    try {
      const response = await fetch(`${iconPath(icon)}?size=${small ? 'sm' : 'full'}`);
      if (!response.ok) throw new Error(`Download returned ${response.status}`);
      const fallback = response.headers.get('x-icons-fallback') === '1';
      const source = await response.blob();
      const blob = small ? await asWebp96(source) : source;
      const filename = small ? icon.sm : fallback ? `${fileStem(icon.file)}.svg` : icon.file;
      const link = document.createElement('a');
      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setFeedback(`${fallback ? 'Generated ' : ''}${filename} downloaded`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Download failed');
    } finally {
      setBusy(null);
    }
  }

  const sampleUrl = `${ICONS_ORIGIN}/coin/BTC`;
  const sampleHtml = `<img src="${sampleUrl}" alt="Bitcoin" width="48" height="48">`;
  const sampleReact = `<img src="${sampleUrl}" alt="Bitcoin" width={48} height={48} />`;
  const sampleMarkdown = `![Bitcoin](${sampleUrl})`;

  return (
    <>
      <a class="skip-link" href="#gallery">Skip to gallery</a>
      <header class="site-header">
        <a class="wordmark" href="#top" aria-label="Crypto Icons home"><span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span><span></span></span>Crypto Icons</a>
        <nav aria-label="Primary navigation">
          <a href="#gallery">Explore</a>
          <a href="#use">How to use</a>
          <button class="theme-toggle" type="button" onClick={toggleTheme} aria-label={dark() ? 'Switch to light theme' : 'Switch to dark theme'} title={dark() ? 'Light theme' : 'Dark theme'}>
            <Show when={dark()} fallback={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20.5 14.4A8.5 8.5 0 0 1 9.6 3.5 8.5 8.5 0 1 0 20.5 14.4Z" /></svg>}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg></Show>
          </button>
        </nav>
      </header>

      <main id="top">
        <section class="hero shell" aria-labelledby="hero-title">
          <h1 id="hero-title">Coin and exchange icons for trading.</h1>
          <div class="hero-actions">
            <a class="button button-primary" href={ZIP_URL}>Download ZIP <span aria-hidden="true">↗</span></a>
            <a class="button button-secondary" href={REPO_URL} target="_blank" rel="noopener noreferrer">View on GitHub <span aria-hidden="true">↗</span></a>
          </div>
          <div class="stats" aria-live="polite">
            <div><strong>{loaded() ? coins().length.toLocaleString() : '—'}</strong><span>coin icons</span></div>
            <div class="stat-divider" aria-hidden="true"></div>
            <div><strong>{loaded() ? exchanges().length.toLocaleString() : '—'}</strong><span>exchange icons</span></div>
          </div>
        </section>

        <section class="gallery-section shell" id="gallery" aria-labelledby="gallery-title">
          <div class="section-heading"><h2 id="gallery-title">Browse icons</h2><p>Search coins by ticker or name and exchanges by name or slug.</p></div>
          <div class="gallery-card">
            <div class="gallery-tools">
              <div class="tabs" role="tablist" aria-label="Icon category" onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                const next = tab() === 'coins' ? 'exchanges' : 'coins';
                setTab(next);
                document.getElementById(`${next}-tab`)?.focus();
              }}>
                <button type="button" role="tab" id="coins-tab" aria-controls="gallery-results" aria-selected={tab() === 'coins'} tabIndex={tab() === 'coins' ? 0 : -1} classList={{ active: tab() === 'coins' }} onClick={() => setTab('coins')}>Coins <span>{loaded() ? coins().length.toLocaleString() : '—'}</span></button>
                <button type="button" role="tab" id="exchanges-tab" aria-controls="gallery-results" aria-selected={tab() === 'exchanges'} tabIndex={tab() === 'exchanges' ? 0 : -1} classList={{ active: tab() === 'exchanges' }} onClick={() => setTab('exchanges')}>Exchanges <span>{loaded() ? exchanges().length.toLocaleString() : '—'}</span></button>
              </div>
              <label class="search-field"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg><span class="sr-only">Search icons</span><input type="search" placeholder="Search icons" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} autocomplete="off" /></label>
            </div>
            <div class="gallery-summary" role="status" aria-live="polite">
              <Show when={!loadError()} fallback={<span>{loadError()}</span>}>
                <span>{loaded() ? `${filtered().length.toLocaleString()} ${tab() === 'coins' ? 'coins' : 'exchanges'}` : 'Loading icons…'}</span>
                <span>{tab() === 'coins' ? 'Sorted by market rank, then ticker' : 'Sorted alphabetically'}</span>
              </Show>
            </div>
            <div class="grid-viewport" id="gallery-results" role="tabpanel" aria-labelledby={tab() === 'coins' ? 'coins-tab' : 'exchanges-tab'} ref={gridElement} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
              <Show when={loaded() && filtered().length === 0}><p class="empty-state">No icons match “{query()}”. Try a different search.</p></Show>
              <div class="grid-space" style={{ height: `${rowCount() * ROW_HEIGHT}px` }}>
                <For each={visibleRows()}>{(row) => <div class="grid-row" style={{ top: `${row * ROW_HEIGHT}px`, 'grid-template-columns': `repeat(${columns()}, minmax(0, 1fr))` }}>
                  <For each={iconsInRow(row)}>{(icon) => <button class="icon-card" type="button" onClick={(event) => { lastTrigger = event.currentTarget; setSelected(icon); setFeedback(''); }} aria-label={`View ${iconName(icon)}${icon.kind === 'coin' && iconMeta(icon) ? `, ${icon.symbol}` : ''}`}>
                    <span class="icon-image"><img src={imageUrl(icon, true)} alt="" width="50" height="50" loading="lazy" onError={(event) => { const fallback = `${iconPath(icon)}?size=sm`; if (!event.currentTarget.src.endsWith(fallback)) event.currentTarget.src = fallback; }} /></span>
                    <span class="icon-name">{iconName(icon)}</span>
                    <Show when={iconMeta(icon)}>{(meta) => <span class="icon-meta">{meta()}</span>}</Show>
                  </button>}</For>
                </div>}</For>
              </div>
            </div>
          </div>
        </section>

        <section class="use-section shell" id="use" aria-labelledby="use-title">
          <div class="section-heading"><h2 id="use-title">Use in your project</h2><p>Use the ticker symbol for coins and the slug for exchanges. URL-encode tickers with special characters.</p></div>
          <div class="usage-layout">
            <div class="usage-copy">
              <p>Every icon is available through a stable Cloudflare URL. The default serves a 96px WebP thumbnail. Add <code>?size=full</code> for the original file.</p>
              <p>Keep the icon files in this collection. Use its Cloudflare URLs directly in image tags across all our trading projects.</p>
              <p class="cache-note">Coin ticker URLs are cached for one year. Exchange URLs and coin slug aliases are cached for one day.</p>
            </div>
            <div class="code-stack">
              <For each={[
                { label: 'HTML', value: sampleHtml },
                { label: 'React', value: sampleReact },
                { label: 'Markdown', value: sampleMarkdown }
              ]}>{(sample) => <div class="code-card"><div class="code-top"><span>{sample.label}</span><button type="button" onClick={() => void copy(sample.value, `${sample.label} example`)} aria-label={`Copy ${sample.label} example`}>{feedback() === `${sample.label} example copied` ? 'Copied' : 'Copy'}</button></div><code>{sample.value}</code></div>}</For>
            </div>
          </div>
        </section>
      </main>

      <footer class="site-footer shell"><p>Logos are trademarks of their respective owners and are provided to identify the listed assets.</p><a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span></a></footer>

      <Show when={selected()}>{(icon) => {
        const snippets = examples(icon());
        return <div class="detail-layer"><div class="detail-backdrop" onClick={closePanel} aria-hidden="true"></div><aside class="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title">
          <div class="panel-top"><span>Icon details</span><button type="button" class="close-button" ref={closeButton} onClick={closePanel} aria-label="Close icon details">×</button></div>
          <div class="preview-box"><img src={imageUrl(icon(), false)} alt={`${iconName(icon())} logo`} width="150" height="150" onError={(event) => { const fallback = `${iconPath(icon())}?size=full`; if (!event.currentTarget.src.endsWith(fallback)) event.currentTarget.src = fallback; }} /></div>
          <h2 id="detail-title">{iconName(icon())}</h2>
          <Show when={iconMeta(icon())}>{(meta) => <p class="detail-subtitle">{icon().kind === 'exchange' ? `Exchange · ${meta()}` : meta()}</p>}</Show>
          <div class="detail-actions"><button class="button button-primary" type="button" disabled={busy() !== null} onClick={() => void download(icon(), false)}>Download original</button><button class="button button-secondary" type="button" disabled={busy() !== null} onClick={() => void download(icon(), true)}>Download WebP</button></div>
          <div class="detail-copy"><h3>Embed this icon</h3><div class="detail-url"><code>{publicUrl(icon())}</code></div><div class="copy-actions"><button type="button" onClick={() => void copy(publicUrl(icon()), 'URL')}>Copy URL</button><button type="button" onClick={() => void copy(snippets.html, 'HTML snippet')}>Copy &lt;img&gt; snippet</button><button type="button" onClick={() => void copy(snippets.react, 'React snippet')}>Copy React snippet</button></div></div>
          <p class="panel-feedback" role="status" aria-live="polite">{feedback()}</p>
        </aside></div>;
      }}</Show>
      <div class="global-feedback sr-only" role="status" aria-live="polite">{selected() ? '' : feedback()}</div>
    </>
  );
}

export default App;
