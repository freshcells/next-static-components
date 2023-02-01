import { removeTrailingSlash } from 'next/dist/shared/lib/router/utils/remove-trailing-slash.js'
import { DomainLocale } from 'next/dist/server/config-shared.js'
import { UrlObject } from 'url'
import { detectDomainLocale } from 'next/dist/shared/lib/i18n/detect-domain-locale.js'

export type Url = UrlObject | string

// as next.js has not really a single "utility" method to resolve an url, this is a short version of it.
// It covers most use cases (but maybe not all)
export const resolveUrl = (
  url: Url,
  locale: string,
  defaultLocale: string,
  domains?: DomainLocale[],
  basePath?: string
) => {
  const detectedDomain = detectDomainLocale(domains, undefined, locale)
  const thisUrl = typeof url === 'string' ? url : (url.pathname as string)
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
    result = new URL(localePrefixedUrl, `http${http ? '' : 's'}://${domain}`).href
  }
  return removeTrailingSlash(result)
}
