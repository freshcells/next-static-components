import type { NextRouter } from 'next/router.js'
import { DomainLocale } from 'next/dist/server/config-shared.js'
import { resolveUrl, Url } from './i18n.js'

interface TransitionOptions {
  shallow?: boolean
  locale?: string | false
  scroll?: boolean
  unstable_skipClientCache?: boolean
}

const createURL = (url: string) => {
  try {
    return new URL(url)
  } catch (e) {
    throw new Error(
      '[next-static] Invalid URL passed for `linkPrefix`. Please provide a valid URL in a form of (http|https)://your-domain.com.',
      { cause: e }
    )
  }
}

export const createServerRouter = (
  locale = 'en',
  defaultLocale = 'en',
  locales = ['en'],
  domains?: DomainLocale[],
  basePath = '',
  linkPrefix?: string
): NextRouter => {
  const linkDomainUrl = linkPrefix ? createURL(linkPrefix) : undefined
  return {
    route: '/',
    pathname: '/',
    query: {},
    asPath: '/',
    basePath,
    // @ts-ignore
    events: undefined,
    isFallback: false,
    locale,
    isReady: true,
    locales,
    defaultLocale,
    domainLocales: domains,
    // if we do not provide any domains configuration, but we have a `linkDomain`, we still
    // "simulate" the domain behaviour so the page can be embedded anywhere.
    ...(linkDomainUrl && !domains
      ? {
          isLocaleDomain: true,
          domainLocales: [
            {
              locales: [locale],
              domain: linkDomainUrl?.hostname as string,
              http: linkDomainUrl?.protocol === 'http' ? true : undefined,
              defaultLocale: locale,
            },
          ],
        }
      : {}),
  }
}

export const createClientRouter = (
  locale?: string,
  defaultLocale?: string,
  locales?: string[],
  domains?: DomainLocale[],
  basePath?: string,
  linkDomain?: string
): NextRouter => {
  const serverRouter = createServerRouter(
    locale,
    defaultLocale,
    locales,
    domains,
    basePath,
    linkDomain
  )
  return {
    ...serverRouter,
    async push(url: Url, as?: Url, options?: TransitionOptions): Promise<boolean> {
      location.href = resolveUrl(
        url,
        (options?.locale || serverRouter.locale) as string,
        serverRouter.defaultLocale as string,
        domains,
        basePath
      )
      return true
    },
    async replace(url: Url, as?: Url, options?: TransitionOptions): Promise<boolean> {
      return false
    },
    reload() {
      location.reload()
    },
    async prefetch(): Promise<void> {
      // we do not support prefetching other routes, as we only render components statically.
    },
  }
}
