// client variant — bundling dedups RouterContext by file path; the SSR build
// swaps this for context.server.js (require-cache specifier quirk)
export { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime.js'
