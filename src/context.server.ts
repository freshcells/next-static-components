// SSR swap-in for context.js: must use createRequire with the exact extensionless
// specifier Link's CJS uses — an ESM import lands in a different cache slot and
// produces a second RouterContext
import { createRequire } from 'node:module'
import type { Context } from 'react'
import type { NextRouter } from 'next/router.js'
import { ROUTER_CONTEXT_MODULE } from './const.js'

const cjsRequire = createRequire(import.meta.url)

const sharedRuntime = cjsRequire(ROUTER_CONTEXT_MODULE) as {
  RouterContext: Context<NextRouter | null>
}

export const RouterContext = sharedRuntime.RouterContext
