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
    return [
      `import src from ${JSON.stringify(`${imagePath}?ignore`)}`,
      `export default { src, width: ${width}, height: ${height}, blurDataURL: src }`,
    ].join('\n')
  },
})
