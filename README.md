@freshcells/next-static-components
----------------------------------

[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
![npm](https://img.shields.io/npm/v/@freshcells/next-static-components)

**Experimental.** Render parts of a Next.js application (e.g. Header & Footer) as standalone bundles for embedding into third-party applications. Backed by Vite for the build, Next.js for the runtime API route.

## Install

```
yarn add @freshcells/next-static-components vite @vitejs/plugin-react-swc
```

## Requirements

- `next` ≥ 16
- `vite` ≥ 8 (uses rolldown)
- `@vitejs/plugin-react-swc` ≥ 4
- `node` ≥ 18
- `react`, `react-dom` ≥ 18 (the build uses your hoisted React, **not** Next.js's bundled copy)

## Quick start

1. Add `.next-static/` to `.gitignore`.
2. Create `next-static.config.mjs` in your project root (next to `next.config.mjs`).
3. Add scripts:

   ```json
   {
     "scripts": {
       "build-static": "next-static-components",
       "build-static-dev": "next-static-components dev"
     }
   }
   ```

4. Create a catch-all API route (`pages/api/static/[...slug].ts` or App Router equivalent) wired to `serve()`.

## Configuration: `next-static.config.mjs`

The CLI loads `next-static.config.mjs` (or `.js`) from the directory you run it in. `defineConfig` is just an identity helper for IDE typing — the file can also export a plain object.

```js
// @ts-check
import { defineConfig } from '@freshcells/next-static-components'

export default defineConfig({
  entry: './static-page/entrypoint.tsx',
  importExcludeFromClient: ['../graphql-cache'],
  cssExtendFolders: ['../../../packages/shared/styles/extend'],
  alias: [
    { find: '~fonts', replacement: './src/fonts' },
    { find: '~@images', replacement: './src/images' },
  ],
  additionalData: `$icomoon-font-path: '~fonts/iconfont/fonts';`,
  ssrExternal: ['i18n-iso-countries'],
})
```

| Option | Type | Description |
|---|---|---|
| `entry` | `string` (required) | Path to your entrypoint file (the `@main` module), relative to project root. |
| `importExcludeFromClient` | `string[]` | Specifiers replaced with an empty module on the **client** build only. The SSR build keeps the real implementation. Use for server-only code that the client never needs (e.g. graphql codegen output). |
| `cssExtendFolders` | `string[]` | Folders that mirror `node_modules`. For each `.scss` file imported from `node_modules/<pkg>/<path>.scss`, if `<extendFolder>/<pkg>/<path>.scss` exists it gets appended via `@import`. Equivalent to the `webpack-css-import-inject-loader` chain. |
| `alias` | `{find, replacement}[]` | Extra import + CSS `url()` aliases. `find` may be a string or RegExp. Webpack-style `~pkg` references are stripped automatically — you only need entries here for project-specific paths like `~fonts`, `~@images`. Relative `replacement`s are resolved against the project root. |
| `additionalData` | `string` | Raw SCSS prepended to every Sass entry. Concatenated **after** the consumer's `next.config.sassOptions.additionalData`, so this is where project-specific variable overrides go (e.g. `$icomoon-font-path: '...';`). |
| `ssrExternal` | `string[]` | Extra packages to mark as `external` on the SSR build. The defaults (`next`, `react`, `react-dom`, `react-dom/server`) are always external; add packages that fail to bundle (typically dynamic-`require()` deps like `i18n-iso-countries`). |

### Auto-derived from `next.config.mjs`

The build reads these fields from your existing `next.config.{mjs,js,cjs,ts}` so you don't have to duplicate them:

- `i18n` — locales, defaultLocale, domains
- `basePath`
- `experimental.swcPlugins` — fed to `@vitejs/plugin-react-swc`
- `sassOptions.additionalData` — string prepended to every Sass entry
- `sassOptions.loadPaths` — Sass `@import` resolution roots
- `sassOptions.silenceDeprecations` — Sass deprecation warning filter

There are no in-package defaults for these — Sass behavior matches whatever your `next.config.mjs` already declares. Override or add anything else via `next-static.config.mjs`.

## CLI

```
next-static-components            # production build
next-static-components dev        # watch + dev React
```

| Flag | Description |
|---|---|
| `--dev` | Force development React (unminified errors + dev assertions on the client). Implied by the `dev` subcommand. |
| `--cacheSuffix=<name>` | Use `.next-static/cache/vite-<name>` as the Vite cache directory. Useful for parallel build variants. |

The `dev` subcommand runs `vite build --watch` for both client and SSR. Output filenames are stable (no hashes) and unminified, with inline JS sourcemaps. Rebuilds are picked up by the next request to `/api/static/render` — no Next.js dev-server restart, just a browser refresh.

## Entrypoint

A single file declares all components, props, optional wrapper, and head content.

```tsx
import React from 'react'
import type { Entrypoint, WrapperProps } from '@freshcells/next-static-components'

interface Context { someData: string }
interface Props { someData: string }

const Header = (props: Props) => <p>My Header</p>
const Footer = (props: Props) => <p>My Footer</p>

const entry: Entrypoint<Props, Context> = async (context) => ({
  props: context,
  components: [Header, Footer],
  wrapper: function Wrapper({ components }: WrapperProps) {
    const [header, footer] = components
    return (
      <div>
        {header}
        <div>something in between</div>
        {footer}
      </div>
    )
  },
  additionalHeadElement: <title>A title</title>,
})

export default entry
```

## Next.js API route

```ts
// pages/api/static/[...slug].ts
import { serve } from '@freshcells/next-static-components'

export default serve(
  async (req, res) => ({ someData: 'myValue' }),
  {
    assetPrefix: 'https://your-cdn.example.com',
    linkPrefix: 'https://your-main-domain.example.com',
    locale: 'de-de',
  }
)
```

| Option | Description |
|---|---|
| `assetPrefix` | URL prefix for emitted assets (CDN host). Empty = relative URLs. |
| `linkPrefix` | URL prefix used by `useRouter().push()` and link generation. |
| `locale` | Locale to render. Falls back to `next.config.mjs`'s `defaultLocale`. |
| `outputMode` | `'html'` (default), `'jsonp'`, or `(req, res, { styles, head, content, scripts }) => void` for embedding into another framework's response. |

The second argument can also be a function — useful when options depend on `req`:

```ts
export default serve(
  async (req) => ({ /* context */ }),
  async (req) => ({
    locale: (req.query.locale as string) ?? 'en-gb',
    linkPrefix: 'https://some-domain.example.com',
  })
)
```

Run `yarn build-static`, start Next.js (`yarn dev` or `yarn start`), and navigate to `/api/static/render`.

## Dev workflow

Two terminals:

```
yarn build-static-dev   # rebuilds client + SSR on every save
yarn dev                # Next.js dev server (handles the API route)
```

Edit a `.tsx` / `.scss` → terminal A reports `built in Xms` → refresh the browser. SSR-side changes are picked up on the next request without restarting Next.js (mtime-keyed module reload).

## Detecting the static build

`process.env.IS_NEXT_STATIC_BUILD === '1'` is set during the build and dev watcher. Branch on it from `next.config.mjs` if needed.

## Restrictions

### Router

The client-side Next.js router singleton is not initialized. `useRouter()` returns a context-backed mock with read-only properties (`route`, `pathname`, `query`, `locale`, …) and a `push()` that performs a full navigation via `location.href`.

```ts
import Router from 'next/router'    // ❌ no-op default export
import { useRouter } from 'next/router' // ✅
```

### next/head

Runtime head modification is not supported. Use `additionalHeadElement` on the entrypoint to inject head content at SSR time.

### next/dynamic

Backed by `React.lazy` + `Suspense`. Streaming SSR (`renderToPipeableStream` with `onAllReady`) waits for every Suspense boundary, so the rendered HTML contains the resolved content.

Only `dynamic` as the import name is supported:

```ts
import dynamic from 'next/dynamic'   // ✅
```

The build instruments every `dynamic(() => import('./X'))` callsite to record which lazy boundaries actually rendered, so the SSR HTML preloads only the chunks that streamed (no FOUC, no shipping CSS for unrendered branches).

### next/image

Image-file imports return `{ src, width, height, blurDataURL }` — the `StaticImageData` shape `next/image` expects. The `next/image` component itself is not shimmed; it uses your hoisted Next.js copy at runtime.
