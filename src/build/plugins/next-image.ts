import fs from 'node:fs'
import path from 'node:path'
import { imageSize } from 'image-size'
import type { Plugin } from 'vite'

// Match every static-image extension Next.js's `next/image` understands.
// The `?ignore` query routes the second resolve back through Vite's
// default asset handler so the plugin doesn't recurse on itself.
const IMAGE_EXT_RE = /\.(png|jpg|jpeg|gif|webp|avif|ico|bmp|svg)(\?.*)?$/i
const VIRTUAL_PREFIX = '\0next-static/image:'

const encode = (s: string) => Buffer.from(s).toString('base64url')
const decode = (s: string) => Buffer.from(s, 'base64url').toString('utf-8')

/**
 * `import logo from './logo.svg'` returns `string` under Vite's default
 * asset handling — but consumer code (and `next/image`'s `StaticImageData`
 * shape) expects an object `{ src, width, height, blurDataURL }`. This
 * plugin intercepts image-file imports, resolves the file, reads its
 * dimensions, and emits a virtual module exporting that object. Mirrors
 * the public behavior of `vite-plugin-storybook-nextjs`'s `next-image`
 * subplugin without dragging in the rest of that package.
 */
export const nextImagePlugin = (): Plugin => ({
  name: 'next-static-next-image',
  enforce: 'pre',
  async resolveId(id, importer) {
    const [source, query] = id.split('?')
    if (query === 'ignore') return null
    if (!IMAGE_EXT_RE.test(source)) return null
    if (!importer || importer.startsWith(VIRTUAL_PREFIX)) return null

    let imagePath = source
    if (source.startsWith('.')) {
      const importerPath = importer.split('?')[0]
      imagePath = path.posix.join(path.posix.dirname(importerPath), source)
    } else if (!path.isAbsolute(source)) {
      const resolved = await this.resolve(source, importer, { skipSelf: true })
      if (resolved?.id) imagePath = resolved.id.split('?')[0]
    }
    return `${VIRTUAL_PREFIX}${encode(imagePath)}`
  },
  async load(id) {
    if (!id.startsWith(VIRTUAL_PREFIX)) return null
    const imagePath = decode(id.slice(VIRTUAL_PREFIX.length))
    let width = 0
    let height = 0
    try {
      const data = await fs.promises.readFile(imagePath)
      const dims = imageSize(data)
      width = dims.width ?? 0
      height = dims.height ?? 0
    } catch {
      // fall through with zeroed dims; the import still resolves so
      // downstream code can degrade gracefully instead of crashing
    }
    // Getter so the per-request route base (set by the shell via
    // `__NEXT_STATIC_IMG_BASE__`) is read at render time, and so the full
    // origin Vite bakes into the client URL (`new URL(rel, import.meta.url)`)
    // gets stripped before reaching `next/image`'s `url=` param. We exclude
    // `assetPrefix` deliberately — Next.js's optimizer rejects absolute
    // `url=` values unless allowlisted via `images.remotePatterns`.
    return [
      `import rawSrc from ${JSON.stringify(`${imagePath}?ignore`)}`,
      `const getSrc = () => {`,
      `  let path`,
      `  try {`,
      `    const u = new URL(rawSrc, 'http://_')`,
      `    u.searchParams.delete('ignore')`,
      `    path = u.pathname + u.search + u.hash`,
      `  } catch {`,
      `    return rawSrc`,
      `  }`,
      `  if (typeof window === 'undefined') {`,
      `    const base = globalThis.__NEXT_STATIC_IMG_BASE__?.()`,
      `    if (typeof base === 'string' && base) return base.replace(/\\/$/, '') + path`,
      `  }`,
      `  return path`,
      `}`,
      `const data = { width: ${width}, height: ${height} }`,
      `Object.defineProperty(data, 'src', { enumerable: true, get: getSrc })`,
      `Object.defineProperty(data, 'blurDataURL', { enumerable: true, get: getSrc })`,
      `export default data`,
    ].join('\n')
  },
})
