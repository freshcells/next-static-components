import { resolveUrl } from '../i18n.js'

describe('i18n link generation', () => {
  it('should handle non locale configurations', () => {
    expect(resolveUrl('/', 'de', 'de')).toEqual('/')
  })
  it('should resolve domains with multiple locales in a path ', () => {
    expect(
      resolveUrl('/', 'en', 'de', [
        { defaultLocale: 'de', domain: 'sample.com', locales: ['de', 'en'] },
      ])
    ).toEqual('https://sample.com/en')
  })
  it('should resolve a single domain', () => {
    expect(
      resolveUrl('/my-path/hello', 'en', 'de', [
        { defaultLocale: 'en', domain: 'sample.com', locales: ['en'] },
      ])
    ).toEqual('https://sample.com/my-path/hello')
  })
  it('should link to a locale', () => {
    expect(resolveUrl('/my-path/hello', 'en', 'de')).toEqual(
      '/en/my-path/hello'
    )
  })
  it('should include the basePath to a locale', () => {
    expect(
      resolveUrl('/my-path/hello', 'en', 'de', [], '/hello-world')
    ).toEqual('/hello-world/en/my-path/hello')
  })
})
