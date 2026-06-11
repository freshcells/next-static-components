import type { ChildProcess } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildFixture, startFixtureServer, stopFixtureServer } from './helpers.js'

const PORT = 3032
const baseUrl = `http://localhost:${PORT}`

let serverProc: ChildProcess

beforeAll(async () => {
  buildFixture({ WHITELABEL: 'test-wl' })
  serverProc = await startFixtureServer(PORT)
}, 180_000)

afterAll(async () => {
  await stopFixtureServer(serverProc)
})

describe('e2e: WHITELABEL=test-wl build', () => {
  it('swaps src components with their whitelabel counterparts', async () => {
    const res = await fetch(`${baseUrl}/api/static/render`)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('overridden by test-wl')
    expect(body).not.toContain('default banner')
  })

  it('resolves relative imports inside an override against the original location', async () => {
    // `./bannerText` only exists under `src/` — proves the swap keeps the original module id
    const res = await fetch(`${baseUrl}/api/static/render`)
    const body = await res.text()
    expect(body).toContain('from src/bannerText')
  })

  it('still renders the base content around the override', async () => {
    const res = await fetch(`${baseUrl}/api/static/render`)
    const body = await res.text()
    expect(body).toContain('Hello, world!')
    expect(body).toContain('Rendered by next-static-components.')
  })
})
