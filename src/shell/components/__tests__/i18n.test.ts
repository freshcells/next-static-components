import { describe, expect, it } from 'vitest'
import type { DomainLocale } from 'next/dist/server/config-shared.js'
import { addLocaleToPath, getDomainLocaleHref, resolveUrl } from '../i18n.js'

describe('i18n link generation', () => {
  it('should handle non locale configurations', () => {
    expect(resolveUrl('/', 'de', 'de')).toEqual('/')
  })
  it('should resolve domains with multiple locales in a path ', () => {
    expect(
      resolveUrl('/', 'en', 'de', [
        { defaultLocale: 'de', domain: 'sample.com', locales: ['de', 'en'] },
      ]),
    ).toEqual('https://sample.com/en')
  })
  it('should resolve a single domain', () => {
    expect(
      resolveUrl('/my-path/hello', 'en', 'de', [
        { defaultLocale: 'en', domain: 'sample.com', locales: ['en'] },
      ]),
    ).toEqual('https://sample.com/my-path/hello')
  })
  it('should link to a locale', () => {
    expect(resolveUrl('/my-path/hello', 'en', 'de')).toEqual('/en/my-path/hello')
  })
  it('should include the basePath to a locale', () => {
    expect(resolveUrl('/my-path/hello', 'en', 'de', [], '/hello-world')).toEqual(
      '/hello-world/en/my-path/hello',
    )
  })
  it('should not have a trailing slash in case we have a domain', () => {
    expect(
      resolveUrl('/', 'en', 'de', [{ defaultLocale: 'en', domain: 'sample.com', locales: ['en'] }]),
    ).toEqual('https://sample.com')
  })
  it('should not have a trailing slash in case we have parameters', () => {
    expect(
      resolveUrl('/?test=hello', 'en', 'de', [
        { defaultLocale: 'en', domain: 'sample.com', locales: ['en'] },
      ]),
    ).toEqual('https://sample.com/?test=hello')
  })
  it('should keep query and hash of UrlObject urls', () => {
    expect(resolveUrl({ pathname: '/x', query: { a: '1' } }, 'en', 'en')).toEqual('/x?a=1')
  })
})

describe('addLocaleToPath', () => {
  it('prefixes a non-default locale', () => {
    expect(addLocaleToPath('/foo', 'de', 'en')).toEqual('/de/foo')
  })
  it('skips the default locale', () => {
    expect(addLocaleToPath('/foo', 'en', 'en')).toEqual('/foo')
  })
  it('skips locale=false', () => {
    expect(addLocaleToPath('/foo', false, 'en')).toEqual('/foo')
  })
  it('skips /api paths', () => {
    expect(addLocaleToPath('/api/foo', 'de', 'en')).toEqual('/api/foo')
  })
  it('skips already prefixed paths', () => {
    expect(addLocaleToPath('/de/foo', 'de', 'en')).toEqual('/de/foo')
  })
})

const TWO_DOMAINS: DomainLocale[] = [
  { defaultLocale: 'de-de', domain: 'example.de', locales: ['de-de'] },
  { defaultLocale: 'en-gb', domain: 'example.co.uk', http: true, locales: ['en-gb'] },
]

describe('getDomainLocaleHref', () => {
  it('resolves the domain default locale without a locale segment', () => {
    expect(getDomainLocaleHref('/details', 'de-de', undefined, TWO_DOMAINS)).toEqual(
      'https://example.de/details',
    )
  })
  it('switches domains and respects the http flag', () => {
    expect(getDomainLocaleHref('/details', 'en-gb', undefined, TWO_DOMAINS)).toEqual(
      'http://example.co.uk/details',
    )
  })
  it('places basePath between domain and locale segment', () => {
    expect(
      getDomainLocaleHref(
        '/details',
        'en-gb',
        undefined,
        [{ defaultLocale: 'de-de', domain: 'host.example', locales: ['de-de', 'en-gb'] }],
        '/base',
      ),
    ).toEqual('https://host.example/base/en-gb/details')
  })
  it('falls back to path detection for locale=false', () => {
    expect(getDomainLocaleHref('/en-gb/details', false, ['de-de', 'en-gb'], TWO_DOMAINS)).toEqual(
      'http://example.co.uk/en-gb/details',
    )
  })
  it('returns false without a detectable locale', () => {
    expect(getDomainLocaleHref('/details', false, ['de-de', 'en-gb'], TWO_DOMAINS)).toBe(false)
  })
})
