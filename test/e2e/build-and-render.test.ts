import type { ChildProcess } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  buildFixture,
  fetchRender as fetchRenderBody,
  fixtureDir,
  hrefOf,
  startFixtureServer,
  stopFixtureServer,
} from './helpers.js'

const PORT = 3031
const baseUrl = `http://localhost:${PORT}`

let serverProc: ChildProcess

beforeAll(async () => {
  buildFixture()
  serverProc = await startFixtureServer(PORT)
}, 300_000)

afterAll(async () => {
  await stopFixtureServer(serverProc)
})

const fetchRender = (slug = 'render') => fetch(`${baseUrl}/api/static/${slug}`)

describe('e2e: fixture served by `next dev`', () => {
  it('renders Hello World HTML for /api/static/render', async () => {
    const res = await fetchRender()
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Hello, world!')
    expect(body).toContain('Rendered by next-static-components.')
    expect(body).toContain('<title>Fixture</title>')
    expect(body).toMatch(/<script[^>]+type="module"[^>]+src=".+init\..+\.js"/)
    expect(body).toMatch(/<script[^>]+type="module"[^>]+src=".+shell\..+\.js"/)
  })

  it('renders the base (non-whitelabel) component without WHITELABEL set', async () => {
    const res = await fetchRender()
    const body = await res.text()
    // `<!-- -->` separators split interpolated JSX text — assert segments individually
    expect(body).toContain('default banner')
    expect(body).toContain('from src/bannerText')
    expect(body).not.toContain('overridden by test-wl')
  })

  it('returns 404 for an unknown subpath', async () => {
    const res = await fetchRender('nope')
    expect(res.status).toBe(404)
  })

  it('emits the configured locale in __NEXT_STATIC_DATA__', async () => {
    const res = await fetchRender()
    const body = await res.text()
    expect(body).toContain('"locale":"en"')
  })

  it('renders a `dynamic(import())` boundary inline (streaming SSR)', async () => {
    const res = await fetchRender()
    const body = await res.text()
    expect(body).toContain('Hello from a lazy component!')
    expect(body).toContain('data-testid="lazy-message"')
  })

  it('flows `linkPrefix` into `<Link>` via getDomainLocale (full chain)', async () => {
    const res = await fetchRender()
    const body = await res.text()
    // linkPrefix → router-shim domainLocales → Link's getDomainLocale rewrite
    expect(body).toContain('data-testid="router-link"')
    expect(body).toContain('href="https://example.com/details"')
    expect(body).toContain('<span data-testid="link-domain">example.com</span>')
  })

  it('emits a modulepreload for the rendered lazy chunk', async () => {
    const res = await fetchRender()
    const body = await res.text()
    expect(body).toMatch(/<link rel="modulepreload" href="[^"]+LazyMessage[^"]*\.js"/)
  })

  it('renders the static-image `src` field as a path-only URL with no `assetPrefix` and no `?ignore`', async () => {
    // next/image rejects absolute `url=` values; SSR/client filename hashes must align
    const res = await fetchRender()
    const body = await res.text()
    const match = body.match(/<span data-testid="test-img-src">([^<]+)<\/span>/)
    expect(match).toBeTruthy()
    if (!match) return
    const src = match[1]
    expect(src).toMatch(/^\/api\/static\/_next\/assets\/test-img\.[A-Za-z0-9_-]+\.png$/)
    expect(src).not.toContain('my-app-domain')
    expect(src).not.toContain('?ignore')

    const assetRes = await fetch(`${baseUrl}${src}`)
    expect(assetRes.status).toBe(200)
    expect(assetRes.headers.get('content-type')).toMatch(/image\/png/)
  })

  it('serves a sub-inline-limit SVG as a file URL, not a mangled data: URI', async () => {
    const res = await fetchRender()
    const body = await res.text()
    const match = body.match(/<span data-testid="small-svg-src">([^<]+)<\/span>/)
    expect(match).toBeTruthy()
    if (!match) return
    const src = match[1]
    expect(src).toMatch(/^\/api\/static\/_next\/assets\/small-icon\.[A-Za-z0-9_-]+\.svg$/)
    expect(src).not.toContain('svg+xml')

    const assetRes = await fetch(`${baseUrl}${src}`)
    expect(assetRes.status).toBe(200)
    expect(assetRes.headers.get('content-type')).toMatch(/image\/svg/)
  })

  it("prefixes `next/image`'s optimization endpoint with `assetPrefix` but keeps the inner `url=` path-only", async () => {
    // outer endpoint carries assetPrefix; inner `url=` must stay path-only
    const res = await fetchRender()
    const body = await res.text()
    const srcSetMatch = body.match(/srcSet="([^"]+)"/) || body.match(/srcset="([^"]+)"/)
    expect(srcSetMatch).toBeTruthy()
    if (!srcSetMatch) return
    const srcSet = srcSetMatch[1].replaceAll('&amp;', '&')
    const candidates = srcSet.split(',').map((s) => s.trim().split(/\s+/)[0])
    expect(candidates.length).toBeGreaterThan(0)
    for (const c of candidates) {
      expect(c).toMatch(/^https:\/\/my-app-domain\/_next\/image\?/)
      const u = new URL(c)
      const inner = u.searchParams.get('url')
      expect(inner).toMatch(/^\/api\/static\/_next\/assets\/test-img\.[A-Za-z0-9_-]+\.png$/)
      expect(inner).not.toContain('my-app-domain')
      expect(inner).not.toContain('?ignore')
    }
  })

  it('serves the bundled init.js asset', async () => {
    const res = await fetchRender()
    const body = await res.text()
    const match = body.match(/src="([^"]+init[^"]+\.js)"/)
    expect(match).toBeTruthy()
    if (!match) return
    const stripped = match[1].replace(/^https:\/\/my-app-domain/, '')
    const assetUrl = stripped.startsWith('http') ? stripped : `${baseUrl}${stripped}`
    const assetRes = await fetch(assetUrl)
    expect(assetRes.status).toBe(200)
    expect(assetRes.headers.get('content-type')).toMatch(/javascript/)
  })

  it('emits stylesheet links inside <head> so they precede dynamically-preloaded css', async () => {
    // Vite's preload helper appends dynamic-import css to head; body-placed links
    // would rank after it in cascade/@layer order
    const res = await fetchRender()
    const body = await res.text()
    const headEnd = body.indexOf('</head>')
    const firstLink = body.indexOf('<link rel="stylesheet"')
    expect(headEnd).toBeGreaterThan(-1)
    expect(firstLink).toBeGreaterThan(-1)
    expect(firstLink).toBeLessThan(headEnd)
  })

  it('injects jsonp styles into document.head, not the mount target', async () => {
    const res = await fetch(`${baseUrl}/api/static/render?mode=jsonp&callback=myCb`)
    const body = await res.text()
    expect(body).toContain("document.head.insertAdjacentHTML('beforeend', manifest.styles)")
  })

  it('serves the entry stylesheet with the configured postcss plugin applied', async () => {
    const res = await fetchRender()
    const body = await res.text()
    const match = body.match(/<link rel="stylesheet" href="([^"]+\.css)"/)
    expect(match).toBeTruthy()
    if (!match) return
    const stripped = match[1].replace(/^https:\/\/my-app-domain/, '')
    const assetRes = await fetch(`${baseUrl}${stripped}`)
    expect(assetRes.status).toBe(200)
    expect(assetRes.headers.get('content-type')).toMatch(/css/)
    const css = await assetRes.text()
    expect(css).toContain('fixture-styles')
    expect(css).toContain('postcss-marker-applied')
  })

  it('returns plain JSON when ?mode=jsonp without a callback', async () => {
    const res = await fetch(`${baseUrl}/api/static/render?mode=jsonp`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/json/)
    const body = (await res.json()) as { content: string; styles: string; scripts: string }
    expect(body).toHaveProperty('content')
    expect(body).toHaveProperty('styles')
    expect(body).toHaveProperty('scripts')
    expect(body.content).toContain('Hello, world!')
  })

  it('wraps the manifest in the callback when ?mode=jsonp&callback=myCb', async () => {
    const res = await fetch(`${baseUrl}/api/static/render?mode=jsonp&callback=myCb`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/javascript/)
    const body = await res.text()
    expect(body).toMatch(/typeof myCb === 'function' && myCb\(/)
    expect(body).toContain('Hello, world!')
  })

  it('strips disallowed characters from the JSONP callback name', async () => {
    const res = await fetch(
      `${baseUrl}/api/static/render?mode=jsonp&${encodeURIComponent('callback=evil();attack')}`,
    )
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).not.toMatch(/evil\(\)/)
    expect(body).not.toMatch(/attack/)
  })
})

describe('e2e: <Link> with default serving options (linkPrefix, locale=defaultLocale)', () => {
  // the response is byte-identical for these — fetch once
  let body: string
  beforeAll(async () => {
    body = await fetchRenderBody(baseUrl)
  })

  it('resolves internal links through the synthesized linkPrefix domain', () => {
    expect(hrefOf(body, 'link-default')).toBe('https://example.com/details')
    expect(hrefOf(body, 'link-root')).toBe('https://example.com/')
    expect(hrefOf(body, 'link-trailing')).toBe('https://example.com/details')
    expect(hrefOf(body, 'link-as')).toBe('https://example.com/nice-path')
  })

  it('honors the locale prop', () => {
    // 'de' is not in the synthesized domain — falls back to path prefixing
    expect(hrefOf(body, 'link-locale-de')).toBe('/de/details')
    expect(hrefOf(body, 'link-locale-false')).toBe('/details')
  })

  it('passes through external and mailto urls', () => {
    expect(hrefOf(body, 'link-external')).toBe('https://external.example/x')
    expect(hrefOf(body, 'link-mailto')).toBe('mailto:x@y.z')
  })

  it('resolves hash hrefs against asPath (next parity)', () => {
    expect(hrefOf(body, 'link-hash')).toBe('https://example.com/#section')
  })

  it('formats UrlObject hrefs and interpolates dynamic routes', () => {
    expect(hrefOf(body, 'link-urlobject')).toBe('https://example.com/search?q=x')
    expect(hrefOf(body, 'link-dynamic')).toBe('https://example.com/blog/hello')
  })
})

describe('e2e: <Link> with path-prefix i18n (no domains)', () => {
  it('prefixes the current non-default locale', async () => {
    const body = await fetchRenderBody(
      baseUrl,
      '?linkPrefix=none&locale=de&defaultLocale=en&locales=en,de',
    )
    expect(hrefOf(body, 'link-default')).toBe('/de/details')
    expect(hrefOf(body, 'link-locale-en')).toBe('/details')
    expect(hrefOf(body, 'link-locale-false')).toBe('/details')
  })

  it('does not prefix the default locale', async () => {
    const body = await fetchRenderBody(
      baseUrl,
      '?linkPrefix=none&locale=en&defaultLocale=en&locales=en,de',
    )
    expect(hrefOf(body, 'link-default')).toBe('/details')
  })
})

describe('e2e: <Link> with locale domains', () => {
  const TWO_DOMAINS = encodeURIComponent(
    JSON.stringify([
      { defaultLocale: 'de-de', domain: 'example.de', locales: ['de-de'] },
      { defaultLocale: 'en-gb', domain: 'example.co.uk', http: true, locales: ['en-gb'] },
    ]),
  )

  it('resolves the matching domain and switches domains via the locale prop', async () => {
    const body = await fetchRenderBody(
      baseUrl,
      `?linkPrefix=none&locale=de-de&defaultLocale=de-de&locales=de-de,en-gb&domains=${TWO_DOMAINS}`,
    )
    expect(hrefOf(body, 'link-default')).toBe('https://example.de/details')
    expect(hrefOf(body, 'link-locale-en-gb')).toBe('http://example.co.uk/details')
  })

  it('prefixes non-default locales inside a multi-locale domain', async () => {
    const domains = encodeURIComponent(
      JSON.stringify([
        { defaultLocale: 'de-de', domain: 'host.example', locales: ['de-de', 'en-gb'] },
      ]),
    )
    const body = await fetchRenderBody(
      baseUrl,
      `?linkPrefix=none&locale=en-gb&defaultLocale=de-de&locales=de-de,en-gb&domains=${domains}`,
    )
    expect(hrefOf(body, 'link-default')).toBe('https://host.example/en-gb/details')
  })
})

describe('e2e: SSR bundle self-containedness', () => {
  const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)["'](next(?:\/[^"']*)?)["']/gm
  // deliberately hard-coded — this is the guard and must not import the value it guards
  const ALLOWED = /^next\/dist\/shared\/lib\/router-context\.shared-runtime(?:\.js)?$/

  const collectFiles = (dir: string, ext: string) =>
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(ext))
      .map((e) => path.join(e.parentPath, e.name))

  it('imports nothing from next at runtime except the RouterContext shared-runtime', () => {
    const files = collectFiles(path.join(fixtureDir, '.next-static', 'server'), '.mjs')
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(IMPORT_RE)) {
        expect(match[1], `unexpected next import "${match[1]}" in ${file}`).toMatch(ALLOWED)
      }
    }
  })

  it('bundles next entirely into the client assets', () => {
    const files = collectFiles(path.join(fixtureDir, '.next-static', 'client'), '.js')
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      const matches = [...source.matchAll(IMPORT_RE)].map((m) => m[1])
      expect(matches, `unexpected next import(s) in ${file}`).toEqual([])
    }
  })
})
