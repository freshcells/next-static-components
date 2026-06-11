import type { ChildProcess } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildFixture, startFixtureServer, stopFixtureServer } from './helpers.js'

const PORT = 3031
const baseUrl = `http://localhost:${PORT}`

let serverProc: ChildProcess

beforeAll(async () => {
  buildFixture()
  serverProc = await startFixtureServer(PORT)
}, 180_000)

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
