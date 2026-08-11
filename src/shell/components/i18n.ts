import { removeTrailingSlash } from 'next/dist/shared/lib/router/utils/remove-trailing-slash.js'
import { parsePath } from 'next/dist/shared/lib/router/utils/parse-path.js'
import { formatUrl } from 'next/dist/shared/lib/router/utils/format-url.js'
import { addLocale } from 'next/dist/shared/lib/router/utils/add-locale.js'
import { addPathPrefix } from 'next/dist/shared/lib/router/utils/add-path-prefix.js'
import { normalizeLocalePath } from 'next/dist/shared/lib/i18n/normalize-locale-path.js'
import { detectDomainLocale } from 'next/dist/shared/lib/i18n/detect-domain-locale.js'
import { isAbsoluteUrl } from 'next/dist/shared/lib/utils.js'
import { resolveHref } from 'next/dist/client/resolve-href.js'
import { DomainLocale } from 'next/dist/server/config-shared.js'
import { UrlObject } from 'url'
import type { NextRouter } from 'next/router.js'

export type Url = UrlObject | string

// as next.js has not really a single "utility" method to resolve an url, this is a short version of it.
// It covers most use cases (but maybe not all)
export const resolveUrl = (
  url: Url,
  locale: string,
  defaultLocale: string,
  domains?: DomainLocale[],
  basePath?: string,
) => {
  const detectedDomain = detectDomainLocale(domains, undefined, locale)
  const thisUrl = typeof url === 'string' ? url : formatUrl(url)
  let result
  let localePrefixedUrl =
    locale && locale !== (detectedDomain?.defaultLocale || defaultLocale)
      ? `/${locale}${thisUrl}`
      : thisUrl

  if (basePath) {
    localePrefixedUrl = `${basePath}${localePrefixedUrl}`
  }
  result = localePrefixedUrl
  if (detectedDomain) {
    // we only ever have a single domain in here
    const { domain, http } = detectedDomain
    // prevent trailing slashes in case we have a domain
    const thisURLPrefix = localePrefixedUrl === '/' ? '' : localePrefixedUrl
    result = new URL(thisURLPrefix, `http${http ? '' : 's'}://${domain}`).href
  }
  return removeTrailingSlash(result)
}

// port of next/dist/client/normalize-trailing-slash.js without the `trailingSlash` env branches
export const normalizePathTrailingSlash = (path: string) => {
  if (!path.startsWith('/')) {
    return path
  }
  const { pathname, query, hash } = parsePath(path)
  return `${removeTrailingSlash(pathname)}${query}${hash}`
}

export const addLocaleToPath = (
  path: string,
  locale: string | false | undefined,
  defaultLocale?: string,
) => normalizePathTrailingSlash(addLocale(path, locale || undefined, defaultLocale))

export const addBasePathToPath = (path: string, basePath = '') =>
  normalizePathTrailingSlash(addPathPrefix(path, basePath))

// port of next/dist/client/get-domain-locale.js, taking basePath from the router instead of a build-time env
export const getDomainLocaleHref = (
  path: string,
  locale: string | false | undefined,
  locales?: readonly string[],
  domainLocales?: readonly DomainLocale[],
  basePath = '',
) => {
  const target = locale || normalizeLocalePath(path, locales as string[] | undefined).detectedLocale
  const domain = detectDomainLocale(domainLocales as DomainLocale[] | undefined, undefined, target)
  if (!domain) {
    return false
  }
  const proto = `http${domain.http ? '' : 's'}://`
  const finalLocale = target === domain.defaultLocale ? '' : `/${target}`
  return `${proto}${domain.domain}${normalizePathTrailingSlash(`${basePath}${finalLocale}${path}`)}`
}

// mirrors next/dist/client/link.js's href computation, minus the env-gated helpers
export const resolveLinkHref = (
  router: NextRouter | null,
  href: Url,
  as?: Url,
  locale?: string | false,
): string => {
  let resolvedAs: string
  if (!router) {
    const url = as || href
    resolvedAs = typeof url === 'string' ? url : formatUrl(url)
  } else if (as) {
    resolvedAs = resolveHref(router, as) as string
  } else {
    const [resolvedHref, asFromHref] = resolveHref(router, href, true)
    resolvedAs = asFromHref || resolvedHref
  }
  if (isAbsoluteUrl(resolvedAs)) {
    return resolvedAs
  }
  const curLocale = typeof locale !== 'undefined' ? locale : router?.locale
  const localeDomain =
    router?.isLocaleDomain &&
    getDomainLocaleHref(resolvedAs, curLocale, router.locales, router.domainLocales, router.basePath)
  return (
    localeDomain ||
    addBasePathToPath(addLocaleToPath(resolvedAs, curLocale, router?.defaultLocale), router?.basePath)
  )
}
