// Re-export Next's own `RouterContext` so our `<RouterContext.Provider>`
// and Next's `<Link>` (`useContext(RouterContext)`) share the same
// instance. Link's CJS source resolves the context via
// `require("../shared/lib/router-context.shared-runtime")` — note the
// missing `.js`. Inside Next's dev runtime, the require cache is keyed
// by specifier (not resolved path), so an ESM `import ... from
// 'next/dist/.../shared-runtime.js'` lands in a different cache slot
// than Link's CJS require, producing two distinct context objects and
// silently breaking `Link`'s `getDomainLocale()` rewrite. We therefore
// pull the context via `createRequire` with the exact specifier Link
// uses.
import { createRequire } from 'node:module'
import type { Context } from 'react'
import type { NextRouter } from 'next/router.js'

const cjsRequire = createRequire(import.meta.url)

const sharedRuntime = cjsRequire('next/dist/shared/lib/router-context.shared-runtime') as {
  RouterContext: Context<NextRouter | null>
}

export const RouterContext = sharedRuntime.RouterContext
