import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { NextRouter } from 'next/router.js'
import type { DomainLocale } from 'next/dist/server/config-shared.js'
import Link, { useLinkStatus } from '../next-link-shim.js'
import { RouterContext } from '../context.js'
import { createServerRouter } from '../shell/components/router.js'

const render = (router: NextRouter | null, props: React.ComponentProps<typeof Link>) =>
  renderToStaticMarkup(
    <RouterContext.Provider value={router}>
      <Link {...props} />
    </RouterContext.Provider>,
  )

const hrefOf = (markup: string) => markup.match(/href="([^"]*)"/)?.[1]

const linkPrefixRouter = () =>
  createServerRouter('en', 'en', ['en'], undefined, '', 'https://example.com')

const TWO_DOMAINS: DomainLocale[] = [
  { defaultLocale: 'de-de', domain: 'example.de', locales: ['de-de'] },
  { defaultLocale: 'en-gb', domain: 'example.co.uk', http: true, locales: ['en-gb'] },
]

describe('next/link shim', () => {
  it('resolves through the synthesized linkPrefix domain', () => {
    expect(hrefOf(render(linkPrefixRouter(), { href: '/details' }))).toEqual(
      'https://example.com/details',
    )
    expect(hrefOf(render(linkPrefixRouter(), { href: '/' }))).toEqual('https://example.com/')
    expect(hrefOf(render(linkPrefixRouter(), { href: '/details/' }))).toEqual(
      'https://example.com/details',
    )
  })
  it('locale prop overrides the router locale', () => {
    // 'de' is not in the synthesized domain — falls back to path prefixing
    expect(hrefOf(render(linkPrefixRouter(), { href: '/details', locale: 'de' }))).toEqual(
      '/de/details',
    )
    expect(hrefOf(render(linkPrefixRouter(), { href: '/details', locale: false }))).toEqual(
      '/details',
    )
  })
  it('prefixes non-default locales without domains', () => {
    const router = createServerRouter('de', 'en', ['en', 'de'])
    expect(hrefOf(render(router, { href: '/details' }))).toEqual('/de/details')
    expect(hrefOf(render(router, { href: '/' }))).toEqual('/de')
    const defaultRouter = createServerRouter('en', 'en', ['en', 'de'])
    expect(hrefOf(render(defaultRouter, { href: '/details' }))).toEqual('/details')
  })
  it('resolves configured locale domains', () => {
    const router = createServerRouter('de-de', 'de-de', ['de-de', 'en-gb'], TWO_DOMAINS)
    expect(hrefOf(render(router, { href: '/details' }))).toEqual('https://example.de/details')
    expect(hrefOf(render(router, { href: '/details', locale: 'en-gb' }))).toEqual(
      'http://example.co.uk/details',
    )
  })
  it('prefixes locales inside a multi-locale domain', () => {
    const router = createServerRouter('en-gb', 'de-de', ['de-de', 'en-gb'], [
      { defaultLocale: 'de-de', domain: 'host.example', locales: ['de-de', 'en-gb'] },
    ])
    expect(hrefOf(render(router, { href: '/details' }))).toEqual(
      'https://host.example/en-gb/details',
    )
  })
  it('places basePath before the locale segment', () => {
    const router = createServerRouter('de', 'en', ['en', 'de'], undefined, '/embedded')
    expect(hrefOf(render(router, { href: '/details' }))).toEqual('/embedded/de/details')
    const prefixRouter = createServerRouter(
      'en',
      'en',
      ['en'],
      undefined,
      '/embedded',
      'https://example.com',
    )
    expect(hrefOf(render(prefixRouter, { href: '/details' }))).toEqual(
      'https://example.com/embedded/details',
    )
  })
  it('passes through external urls', () => {
    expect(hrefOf(render(linkPrefixRouter(), { href: 'https://external.example/x' }))).toEqual(
      'https://external.example/x',
    )
    expect(hrefOf(render(linkPrefixRouter(), { href: 'mailto:x@y.z' }))).toEqual('mailto:x@y.z')
  })
  it('resolves hash hrefs against asPath (next parity)', () => {
    expect(hrefOf(render(linkPrefixRouter(), { href: '#section' }))).toEqual(
      'https://example.com/#section',
    )
    const router = createServerRouter('de', 'en', ['en', 'de'])
    expect(hrefOf(render(router, { href: '#section' }))).toEqual('/de#section')
  })
  it('formats UrlObject hrefs and interpolates dynamic routes', () => {
    expect(
      hrefOf(render(linkPrefixRouter(), { href: { pathname: '/search', query: { q: 'x' } } })),
    ).toEqual('https://example.com/search?q=x')
    expect(
      hrefOf(
        render(linkPrefixRouter(), { href: { pathname: '/blog/[slug]', query: { slug: 'hello' } } }),
      ),
    ).toEqual('https://example.com/blog/hello')
  })
  it('renders `as` instead of `href`', () => {
    expect(hrefOf(render(linkPrefixRouter(), { href: '/details', as: '/nice-path' }))).toEqual(
      'https://example.com/nice-path',
    )
  })
  it('formats hrefs without a router', () => {
    expect(hrefOf(render(null, { href: '/details' }))).toEqual('/details')
    expect(hrefOf(render(null, { href: { pathname: '/search', query: { q: 'x' } } }))).toEqual(
      '/search?q=x',
    )
  })
  it('keeps router-only props off the anchor', () => {
    const markup = render(linkPrefixRouter(), {
      href: '/details',
      replace: true,
      prefetch: false,
      passHref: true,
      legacyBehavior: true,
      scroll: false,
      shallow: true,
      className: 'my-link',
      target: '_blank',
      'data-testid': 'the-link',
    } as React.ComponentProps<typeof Link>)
    expect(markup).toContain('class="my-link"')
    expect(markup).toContain('data-testid="the-link"')
    expect(markup).toContain('target="_blank"')
    for (const leaked of ['replace', 'prefetch', 'passHref', 'legacyBehavior', 'scroll', 'shallow']) {
      expect(markup).not.toContain(leaked)
    }
  })
  it('reports no pending link status', () => {
    expect(useLinkStatus()).toEqual({ pending: false })
  })
})
