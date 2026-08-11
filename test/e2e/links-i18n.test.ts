import type { ChildProcess } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  buildFixture,
  fetchRender,
  hrefOf,
  startFixtureServer,
  stopFixtureServer,
} from './helpers.js'

const PORT = 3034
const BASE_PATH = '/embedded'
const baseUrl = `http://localhost:${PORT}${BASE_PATH}`

let serverProc: ChildProcess

beforeAll(async () => {
  buildFixture({ FIXTURE_I18N: '1' })
  serverProc = await startFixtureServer(PORT, {
    basePath: BASE_PATH,
    env: { FIXTURE_I18N: '1' },
  })
}, 300_000)

afterAll(async () => {
  await stopFixtureServer(serverProc)
})

describe('e2e: <Link> with next.config i18n + basePath baked at build time', () => {
  it('falls back to the build-time i18n config without serving options', async () => {
    const body = await fetchRender(baseUrl, '?servingOptions=none')
    expect(hrefOf(body, 'link-default')).toBe('/embedded/details')
    expect(body).toContain('"locales":["en","de"]')
    expect(body).toContain('"basePath":"/embedded"')
  })

  it('orders basePath before the locale prefix', async () => {
    const body = await fetchRender(
      baseUrl,
      '?linkPrefix=none&locale=de&defaultLocale=en&locales=en,de',
    )
    expect(hrefOf(body, 'link-default')).toBe('/embedded/de/details')
  })

  it('places basePath inside domain urls', async () => {
    const body = await fetchRender(baseUrl, '?locale=en')
    expect(hrefOf(body, 'link-default')).toBe('https://example.com/embedded/details')
  })

  it('never locale-prefixes under linkPrefix alone (locale becomes the domain default)', async () => {
    const body = await fetchRender(baseUrl, '?locale=de&defaultLocale=en')
    expect(hrefOf(body, 'link-default')).toBe('https://example.com/embedded/details')
  })
})
