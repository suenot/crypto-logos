import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import sharp from "sharp"
import catalog from "../data/services.json"
import { entries, inlineSvgStyles } from "./sync-services"

test("service catalog rows are sorted, unique, and backed by originals and 96px WebPs", async () => {
  expect(catalog.length).toBe(entries.length)
  expect(new Set(catalog.map(({ slug }) => slug)).size).toBe(catalog.length)
  expect(catalog).toEqual([...catalog].sort((a, b) => a.name.localeCompare(b.name, "en")))
  for (const row of catalog) {
    expect(row.slug).toMatch(/^[a-z0-9-]+$/)
    expect(row.kind).toMatch(/^(data|news|onchain|signals|broker|dex|registry|tool)$/)
    expect([`${row.slug}.svg`, `${row.slug}.png`]).toContain(row.file)
    expect(row.sm).toBe(`${row.slug}.webp`)
    expect(await Bun.file(join(import.meta.dir, "..", "icons", "services", row.file)).exists()).toBe(true)
    const thumbnail = await sharp(join(import.meta.dir, "..", "icons", "sm", "services", row.sm)).metadata()
    expect(thumbnail).toMatchObject({ format: "webp", width: 96, height: 96 })
  }
})

describe("inlineSvgStyles", () => {
  test("inlines light rules, drops dark media and the style element", () => {
    const svg = '<svg viewBox="0 0 2 2"><style>.box{fill:#0a0a0a}path{fill:#111}@media (prefers-color-scheme:dark){.box{fill:#fff}}</style><circle class="box" r="1"/><path d="M0 0" class="box"/><path d="M1 1" fill="red"/></svg>'
    const out = inlineSvgStyles(svg)
    expect(out).not.toContain("<style")
    expect(out).not.toContain("#fff")
    expect(out).toContain('<circle class="box" r="1" fill="#0a0a0a"/>')
    expect(out).toContain('<path d="M0 0" class="box" fill="#0a0a0a"/>')
    expect(out).toContain('<path d="M1 1" fill="red"/>')
  })
  test("rejects selectors it cannot inline", () => {
    expect(() => inlineSvgStyles('<svg><style>g > path{fill:#000}</style></svg>')).toThrow("Unsupported SVG style selector")
  })
})
