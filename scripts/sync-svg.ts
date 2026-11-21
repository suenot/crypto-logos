// Adds real vector logos where they exist. Source: spothq/cryptocurrency-icons (CC0), svg/color/<symbol>.svg.
// Uploads coin-logos/<stem>.svg to the R2 bucket (additive, existing keys are kept) and writes data/svg.json.
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment. Run: bun scripts/sync-svg.ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Coin } from "../data/catalog";

const BUCKET = "listingapis-logos";
const RAW = "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color";
const root = path.resolve(import.meta.dir, "..");

const tree = (await (await fetch("https://api.github.com/repos/spothq/cryptocurrency-icons/git/trees/master?recursive=1")).json()) as {
  tree: { path: string }[];
};
const available = new Set(tree.tree.filter((n) => n.path.startsWith("svg/color/") && n.path.endsWith(".svg")).map((n) => n.path.slice(10, -4)));
const coins = (await Bun.file(path.join(root, "data/coins.json")).json()) as Coin[];
const existing: string[] = await Bun.file(path.join(root, "data/svg.json")).json().catch(() => []);
const stems = [...new Set(coins.map((c) => c.stem.toLowerCase()).filter((s) => available.has(s) && !existing.includes(s)))].sort();
console.log(`${stems.length} coins have a real SVG`);

await Bun.spawn(["bun", "x", "wrangler@latest", "--version"], { stdout: "ignore", stderr: "ignore" }).exited; // warm the package cache once
const work = await mkdtemp(path.join(tmpdir(), "svg-"));
const done: string[] = [];
const failed: string[] = [];
let next = 0;

async function upload(stem: string) {
  const response = await fetch(`${RAW}/${encodeURIComponent(stem)}.svg`);
  if (!response.ok) throw new Error(`download ${response.status}`);
  const text = await response.text();
  if (!text.includes("<svg")) throw new Error("not an svg");
  const file = path.join(work, `${done.length}-${next}.svg`);
  await writeFile(file, text);
  const proc = Bun.spawn(
    ["bun", "x", "wrangler@latest", "r2", "object", "put", `${BUCKET}/coin-logos/${stem}.svg`, "--file", file, "--content-type", "image/svg+xml", "--remote"],
    { stdout: "ignore", stderr: "pipe" },
  );
  if ((await proc.exited) !== 0) throw new Error((await new Response(proc.stderr).text()).slice(0, 200));
}

async function worker() {
  while (next < stems.length) {
    const stem = stems[next++];
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await upload(stem);
        done.push(stem);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError !== undefined) {
      failed.push(stem);
      console.error(`FAILED ${stem}: ${lastError instanceof Error ? lastError.message : lastError}`);
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
const all = [...new Set([...existing, ...done])].sort();
await writeFile(path.join(root, "data/svg.json"), JSON.stringify(all) + "\n");
console.log(`uploaded ${done.length}, failed ${failed.length}`);
