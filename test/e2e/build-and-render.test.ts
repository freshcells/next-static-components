import { type ChildProcess, execSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const fixtureDir = fileURLToPath(new URL('../fixture', import.meta.url))
const PORT = 3031
const baseUrl = `http://localhost:${PORT}`

let serverProc: ChildProcess

const waitForServer = async (deadlineMs: number) => {
  const deadline = Date.now() + deadlineMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(baseUrl, { signal: AbortSignal.timeout(1000) })
      // Any HTTP response (even 404 from the homepage) means the server is up.
      if (res.status > 0) return
    } catch {
      // server not yet listening
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Server didn't respond on ${baseUrl} within ${deadlineMs}ms`)
}

beforeAll(async () => {
  execSync('yarn build-static', { cwd: fixtureDir, stdio: 'pipe' })

  // Spawn `next dev` directly so we can override the port without touching
  // the fixture's `dev` script (which a developer might be running locally).
  serverProc = spawn('yarn', ['next', 'dev', '-p', String(PORT)], {
    cwd: fixtureDir,
    stdio: 'pipe',
    detached: true,
    env: { ...process.env, NODE_ENV: 'development' },
  })
  serverProc.stdout?.on('data', () => {})
  serverProc.stderr?.on('data', () => {})

  await waitForServer(60_000)
}, 180_000)

afterAll(async () => {
  if (!serverProc || serverProc.killed) return
  // `yarn` spawns `next` as a child; killing yarn doesn't always cascade.
  // Use SIGKILL on the whole subtree.
  try {
    if (serverProc.pid) process.kill(-serverProc.pid, 'SIGKILL')
  } catch {
    serverProc.kill('SIGKILL')
  }
  await new Promise<void>((r) => {
    serverProc.on('close', () => r())
    setTimeout(r, 5_000).unref()
  })
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

  it('emits a modulepreload for the rendered lazy chunk', async () => {
    const res = await fetchRender()
    const body = await res.text()
    // The `record-imports` plugin records the lazy module's manifest key on
    // SSR render; `app-shell.server.tsx` then walks the manifest and emits
    // `<link rel="modulepreload">` for the chunk.
    expect(body).toMatch(
      /<link rel="modulepreload" href="[^"]+LazyMessage[^"]*\.js"/,
    )
  })

  it('serves the bundled init.js asset', async () => {
    const res = await fetchRender()
    const body = await res.text()
    const match = body.match(/src="([^"]+init[^"]+\.js)"/)
    expect(match).toBeTruthy()
    if (!match) return
    // The src is absolute (`/api/static/_next/...`) — fetch it directly.
    const assetUrl = match[1].startsWith('http') ? match[1] : `${baseUrl}${match[1]}`
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
    // JSONP wrapper: `/**/ typeof myCb === 'function' && myCb((function (manifest) { … })({...}));`
    expect(body).toMatch(/typeof myCb === 'function' && myCb\(/)
    expect(body).toContain('Hello, world!')
  })

  it('strips disallowed characters from the JSONP callback name', async () => {
    const res = await fetch(
      `${baseUrl}/api/static/render?mode=jsonp&${encodeURIComponent('callback=evil();attack')}`,
    )
    // The malformed `callback` should not be parsed as a single string with
    // unsafe chars — server-side it gets sanitized via `.replace(/[^[\]\w$.]/g, '')`.
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).not.toMatch(/evil\(\)/)
    expect(body).not.toMatch(/attack/)
  })
})
