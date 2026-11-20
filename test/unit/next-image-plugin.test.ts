import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { nextImagePlugin } from '../../src/build/plugins/next-image.js'

// 1x1 png
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const roots: string[] = []
const makeRoot = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'next-image-plugin-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

type ImageData = { src: string; width: number; height: number }

const buildEntry = async (root: string, key: string, output: Record<string, string> = {}) => {
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
        output: { entryFileNames: '[name].mjs', ...output },
      },
    },
  })
  await import(pathToFileURL(path.join(root, 'out', 'entry.mjs')).href)
  return {
    emitted: readdirSync(path.join(root, 'out', 'assets')),
    data: (await (globalThis as Record<string, unknown>)[key]) as ImageData,
  }
}

const expectImageData = ({ src, width, height }: ImageData) => {
  expect(width).toBe(1)
  expect(height).toBe(1)
  expect(src).not.toContain('?ignore')
  expect(src).not.toMatch(/^(https?|file):/)
  expect(src).toMatch(/\/img[.-][A-Za-z0-9_-]+\.png$/)
}

describe('nextImagePlugin codegen in a minified client build', () => {
  // regression: rolldown inlines the __VITE_ASSET__ literal into the data:-guard;
  // a receiver-position method call turns always-truthy after Vite's URL splice,
  // leaking the raw asset URL (`?ignore`, absolute origin) into `src`
  it('resolves `src` to a path without `?ignore` or an origin', async () => {
    const root = makeRoot()
    writeFileSync(path.join(root, 'img.png'), PNG)
    // app builds drop entry exports — hand the module out via globalThis instead
    writeFileSync(
      path.join(root, 'entry.js'),
      "import data from './img.png'\nglobalThis.__NEXT_STATIC_TEST_IMG__ = data\n",
    )

    const { emitted, data } = await buildEntry(root, '__NEXT_STATIC_TEST_IMG__')
    expect(emitted.some((f) => f.endsWith('.png'))).toBe(true)
    expectImageData(data)
  }, 60_000)

  it('names split image chunks after the file, not the encoded path', async () => {
    const root = makeRoot()
    const deep = path.join(
      root,
      ...Array.from({ length: 8 }, (_, i) => `some-long-directory-name-${i}`),
    )
    mkdirSync(deep, { recursive: true })
    writeFileSync(path.join(deep, 'img.png'), PNG)
    const rel = path.relative(root, path.join(deep, 'img.png')).split(path.sep).join('/')
    writeFileSync(
      path.join(root, 'entry.js'),
      `globalThis.__NEXT_STATIC_TEST_LAZY_IMG__ = import('./${rel}').then((m) => m.default)\n`,
    )

    const { emitted, data } = await buildEntry(root, '__NEXT_STATIC_TEST_LAZY_IMG__', {
      chunkFileNames: 'assets/[name].[hash].js',
    })
    expect(emitted.some((f) => /^img-[0-9a-f]{8}\.[\w-]+\.js$/.test(f))).toBe(true)
    for (const f of emitted) {
      expect(f).not.toContain('image_')
      expect(f.length).toBeLessThan(80)
    }
    expectImageData(data)
  }, 60_000)
})
