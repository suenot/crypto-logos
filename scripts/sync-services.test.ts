import { expect, test } from "bun:test"
import { join } from "node:path"
import sharp from "sharp"
import catalog from "../data/services.json"
import { entries } from "./sync-services"

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
