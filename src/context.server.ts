// SSR variant — used in the SSR Vite build via a `resolve.alias` swap of
// `context.js`. Inside Next dev's runtime, the require cache is keyed by
// the import specifier, not the resolved path. Link's CJS source
// `require("../shared/lib/router-context.shared-runtime")` (no `.js`)
// lands in a different cache slot than an ESM `import ... from
// '...shared-runtime.js'`, producing two distinct `RouterContext`
// objects and silently breaking `Link`'s `getDomainLocale()` rewrite.
// We pull the context via `createRequire` with the exact specifier
// Link uses.
import { createRequire } from 'node:module'
import type { Context } from 'react'
import type { NextRouter } from 'next/router.js'

const cjsRequire = createRequire(import.meta.url)

const sharedRuntime = cjsRequire('next/dist/shared/lib/router-context.shared-runtime') as {
  RouterContext: Context<NextRouter | null>
}

export const RouterContext = sharedRuntime.RouterContext
