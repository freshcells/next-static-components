import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts'],
    // The e2e test shells out to `yarn build-static` and spawns `next dev`,
    // and the first request against the dev server triggers Turbopack
    // compilation — both push past vitest's 10s defaults.
    hookTimeout: 180_000,
    testTimeout: 60_000,
  },
})
