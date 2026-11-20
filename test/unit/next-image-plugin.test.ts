import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { nextImagePlugin } from '../../src/build/plugins/next-image.js'

// 1x1 png
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

describe('nextImagePlugin codegen in a minified client build', () => {
  // regression: rolldown inlines the __VITE_ASSET__ literal into the data:-guard;
  // a receiver-position method call turns always-truthy after Vite's URL splice,
  // leaking the raw asset URL (`?ignore`, absolute origin) into `src`
  it('resolves `src` to a path without `?ignore` or an origin', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'next-image-plugin-'))
    writeFileSync(path.join(root, 'img.png'), PNG)
    // app builds drop entry exports — hand the module out via globalThis instead
    writeFileSync(
      path.join(root, 'entry.js'),
      "import data from './img.png'\nglobalThis.__NEXT_STATIC_TEST_IMG__ = data\n",
    )

    await build({
      root,
      base: './',
      configFile: false,
      logLevel: 'silent',
      plugins: [nextImagePlugin()],
      build: {
        outDir: 'out',
        rollupOptions: {
          input: { entry: path.join(root, 'entry.js') },
          output: { entryFileNames: '[name].mjs' },
        },
      },
    })

    const emitted = readdirSync(path.join(root, 'out', 'assets'))
    expect(emitted.some((f) => f.endsWith('.png'))).toBe(true)

    await import(pathToFileURL(path.join(root, 'out', 'entry.mjs')).href)
    const data = (globalThis as Record<string, unknown>)['__NEXT_STATIC_TEST_IMG__'] as {
      src: string
      width: number
      height: number
    }
    const { src, width, height } = data
    expect(width).toBe(1)
    expect(height).toBe(1)
    expect(src).not.toContain('?ignore')
    expect(src).not.toMatch(/^(https?|file):/)
    expect(src).toMatch(/\/img[.-][A-Za-z0-9_-]+\.png$/)
  }, 60_000)

  it('names split image chunks after the file, not the encoded path', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'next-image-plugin-'))
    const deep = path.join(root, ...Array.from({ length: 8 }, (_, i) => `some-long-directory-name-${i}`))
    mkdirSync(deep, { recursive: true })
    writeFileSync(path.join(deep, 'img.png'), PNG)
    const rel = path.relative(root, path.join(deep, 'img.png')).split(path.sep).join('/')
    writeFileSync(
      path.join(root, 'entry.js'),
      `globalThis.__NEXT_STATIC_TEST_LAZY_IMG__ = import('./${rel}').then((m) => m.default)\n`,
    )

    await build({
      root,
      base: './',
      configFile: false,
      logLevel: 'silent',
      plugins: [nextImagePlugin()],
      build: {
        outDir: 'out',
        rollupOptions: {
          input: { entry: path.join(root, 'entry.js') },
          output: {
            entryFileNames: '[name].mjs',
            chunkFileNames: 'assets/[name].[hash].js',
          },
        },
      },
    })

    const emitted = readdirSync(path.join(root, 'out', 'assets'))
    expect(emitted.some((f) => /^img-[0-9a-f]{8}\.[\w-]+\.js$/.test(f))).toBe(true)
    for (const f of emitted) {
      expect(f).not.toContain('image_')
      expect(f.length).toBeLessThan(80)
    }

    await import(pathToFileURL(path.join(root, 'out', 'entry.mjs')).href)
    const data = (await (globalThis as Record<string, unknown>)['__NEXT_STATIC_TEST_LAZY_IMG__']) as {
      src: string
      width: number
      height: number
    }
    expect(data.width).toBe(1)
    expect(data.height).toBe(1)
    expect(data.src).not.toContain('?ignore')
    expect(data.src).toMatch(/\/img[.-][A-Za-z0-9_-]+\.png$/)
  }, 60_000)
})
