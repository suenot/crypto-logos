import { readdir } from "node:fs/promises"
import { join, resolve } from "node:path"

const bucket = "listingapis-logos"
const groups = [
  { directory: "icons/ai", prefix: "ai-logos", extension: ".svg", type: "image/svg+xml" },
  { directory: "icons/sm/ai", prefix: "ai-logos/sm", extension: ".webp", type: "image/webp" },
]

async function uploadAi(args: string[]) {
  if (args.length > 1 || (args.length === 1 && args[0] !== "--dry-run")) {
    throw new Error("Usage: bun --no-env-file scripts/upload-ai.ts [--dry-run]")
  }
  const dryRun = args.includes("--dry-run")
  const root = resolve(import.meta.dir, "..")
  const uploads = []
  for (const { directory, prefix, extension, type } of groups) {
    const files = (await readdir(join(root, directory), { withFileTypes: true }))
      .filter(file => file.isFile() && file.name.endsWith(extension))
      .map(file => file.name)
      .sort()
    for (const file of files) uploads.push({ path: join(root, directory, file), key: `${prefix}/${file}`, type })
  }

  if (dryRun) {
    for (const { key, type } of uploads) console.log(`${key} (${type})`)
    console.log(`Dry run: ${uploads.length} objects for ${bucket}.`)
    return
  }

  const { R2_ENDPOINT: endpoint, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey } = process.env
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("Set R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY before uploading.")
  }
  const client = new Bun.S3Client({ bucket, endpoint, accessKeyId, secretAccessKey, region: "auto" })
  for (const { path, key, type } of uploads) {
    try {
      await client.write(key, Bun.file(path), { type })
    } catch {
      throw new Error(`Upload failed for ${key}`)
    }
  }
  console.log(`Uploaded ${uploads.length} objects to ${bucket}.`)
}

if (import.meta.main) await uploadAi(process.argv.slice(2))
