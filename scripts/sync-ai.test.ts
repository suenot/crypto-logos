import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import sharp from "sharp"
import catalog from "../data/ai.json"
import { normalizeSvg } from "./sync-ai"

describe("AI SVG normalization", () => {
  test("preserves the viewBox and drawing while sizing and coloring a mono mark", () => {
    const source = `<svg fill="currentColor" height="1em" style="flex:none;line-height:1" viewBox="2 3 24 12" width="1em"><title>Example</title><path fill="currentColor" d="M0 0h2v2z"/></svg>`
    expect(normalizeSvg(source)).toBe(
      `<svg fill="#111111" viewBox="2 3 24 12" width="512" height="256"><title>Example</title><path fill="#111111" d="M0 0h2v2z"/></svg>`,
    )
  })

  test("adds the source brand hex to a fill-less Simple Icons SVG", () => {
    expect(normalizeSvg(`<svg viewBox="0 0 24 24"><path d="M0 0h2v2z"/></svg>`, "084CCF")).toBe(
      `<svg viewBox="0 0 24 24" fill="#084CCF" width="512" height="512"><path d="M0 0h2v2z"/></svg>`,
    )
  })

  test("preserves source colors and local gradient references", () => {
    const drawing = `<path fill="url(#gradient)"/><defs><linearGradient id="gradient"><stop stop-color="#abc"/></linearGradient></defs>`
    const source = `<svg viewBox="0 0 24 24">${drawing}</svg>`
    expect(normalizeSvg(source)).toBe(`<svg viewBox="0 0 24 24" width="512" height="512">${drawing}</svg>`)
  })

  test.each([
    '<script>alert(1)</script>',
    '<image href="https://example.test/image.svg"/>',
    "<use xlink:href='//example.test/mark.svg#symbol'/>",
    '<path fill="url(https://example.test/gradient.svg#fill)"/>',
    '<path onload="alert(1)"/>',
  ])("rejects unsafe SVG markup %s", (drawing) => {
    expect(() => normalizeSvg(`<svg viewBox="0 0 24 24">${drawing}</svg>`)).toThrow("external reference")
  })

  test("rejects an unusable viewBox", () => {
    expect(() => normalizeSvg('<svg viewBox="0 0 0 24"></svg>')).toThrow("Invalid SVG viewBox")
  })
})

test("AI catalog rows are sorted, unique, and backed by normalized SVGs and 96px WebPs", async () => {
  expect(catalog.length).toBeGreaterThan(0)
  expect(new Set(catalog.map(({ slug }) => slug)).size).toBe(catalog.length)
  expect(catalog).toEqual([...catalog].sort((a, b) =>
    a.kind.localeCompare(b.kind, "en") || a.name.localeCompare(b.name, "en")))
  for (const row of catalog) {
    expect(row).toEqual({
      slug: expect.stringMatching(/^[a-z0-9-]+$/),
      name: expect.stringMatching(/\S/),
      kind: expect.stringMatching(/^(company|harness)$/),
      file: `${row.slug}.svg`,
      sm: `${row.slug}.webp`,
      source: expect.stringMatching(/^(lobe-icons|simple-icons)$/),
      variant: expect.stringMatching(/^(color|mono)$/),
    })
    const svg = await Bun.file(join(import.meta.dir, "..", "icons", "ai", row.file)).text()
    expect(normalizeSvg(svg)).toBe(svg)
    expect(svg).not.toMatch(/1em|currentColor/i)
    const thumbnail = await sharp(join(import.meta.dir, "..", "icons", "sm", "ai", row.sm)).metadata()
    expect(thumbnail).toMatchObject({ format: "webp", width: 96, height: 96, hasAlpha: true })
  }
})
