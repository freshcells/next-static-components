import { serve } from '@freshcells/next-static-components'

export default serve(
  async () => ({ greeting: 'Hello, world!' }),
  async (req) => ({
    locale: 'en',
    defaultLocale: 'en',
    locales: ['en'],
    linkPrefix: 'https://example.com',
    outputMode: req.query.mode === 'jsonp' ? 'jsonp' : 'html',
  }),
)
