// Default (client) variant — Vite bundles `next/link` and us together,
// so a plain ESM import dedups the `RouterContext` module by file path.
// The SSR build aliases `context.js` → `context.server.js` to use a
// `createRequire`-based lookup that matches Link's CJS specifier and
// avoids Next dev runtime's specifier-keyed require cache quirk.
export { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime.js'
