import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts'],
    // e2e files build the fixture into the same `.next-static` — no racing
    fileParallelism: false,
    // e2e builds + on-demand Turbopack compiles push past the 10s defaults
    hookTimeout: 180_000,
    testTimeout: 60_000,
  },
})
