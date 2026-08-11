// @ts-check
/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // build variant for the i18n/basePath e2e tests
  ...(process.env.FIXTURE_I18N === '1'
    ? {
        i18n: { locales: ['en', 'de'], defaultLocale: 'en' },
        basePath: '/embedded',
      }
    : {}),
}
