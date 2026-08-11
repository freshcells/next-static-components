import { serve } from '@freshcells/next-static-components'
import type { DomainLocale } from 'next/dist/server/config-shared'

const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default serve(
  async () => ({ greeting: 'Hello, world!' }),
  async (req) => {
    const outputMode = req.query.mode === 'jsonp' ? 'jsonp' : 'html'
    // fall back to build-time next.config i18n
    if (req.query.servingOptions === 'none') {
      return { outputMode }
    }
    const linkPrefix = single(req.query.linkPrefix)
    const domains = single(req.query.domains)
    return {
      locale: single(req.query.locale) ?? 'en',
      defaultLocale: single(req.query.defaultLocale) ?? 'en',
      locales: single(req.query.locales)?.split(',') ?? ['en'],
      linkPrefix: linkPrefix === 'none' ? undefined : (linkPrefix ?? 'https://example.com'),
      domains: domains ? (JSON.parse(domains) as DomainLocale[]) : undefined,
      assetPrefix: 'https://my-app-domain',
      outputMode,
    }
  },
)
