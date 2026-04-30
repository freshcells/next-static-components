@freshcells/next-static-components
----------------------------------

[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
![npm](https://img.shields.io/npm/v/@freshcells/next-static-components)

**Experimental** Utility to render parts of a Next.js application (e.g. Header & Footer)
as standalone bundles for embedding into third-party applications.

## Install

```
yarn add @freshcells/next-static-components vite vite-plugin-storybook-nextjs
```

## Requirements

- `next` 16.x (uses SWC; the previous Babel preset has been removed)
- `vite` >= 5
- `vite-plugin-storybook-nextjs` >= 3.2.4 (used for `next/font`, `next/image`, `next.config.js` loading and SWC)
- `node` >= 18.x
- `react`, `react-dom` >= 18 (the build uses your hoisted React, **not** Next.js's bundled copy)

## Usage

Add the following scripts to your application:

```json
{
  "scripts": {
    "build-static": "next-static-components ./static-page/entrypoint.tsx",
    "dev-static": "next-static-components dev ./static-page/entrypoint.tsx"
  }
}
```

### Build command

```
next-static-components <entrypoint> [options]
```

Runs two Vite builds (client + SSR) and writes them to `.next-static/`. Make sure that folder is included in your build / Dockerfile.

| Flag | Description |
|------|-------------|
| `--cacheSuffix=<name>` | Use `.next-static/cache/vite-<name>` as the Vite cache directory. Useful if you have multiple build variants. |
| `--importExcludeFromClient=<spec>` | Replace this import with an empty module on the client side (the SSR side keeps the real implementation). May be repeated. |

### Dev command

```
next-static-components dev <entrypoint> [--port=5173] [--host=...]
```

Boots a standalone Vite dev server with HMR + React Refresh. Open `http://localhost:5173/` (or your chosen port) in a browser to see your components rendered. Edits to your entrypoint or any imported file hot-reload.

The dev server is fully separate from Next.js; you do not need to run `next dev` in parallel for it to work. The Next.js API route (`serve`) is for the production build only.

### Ignore

Add `.next-static` to your `.gitignore`.

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

## Expose components via a Next.js API route

Create a catch-all API route (e.g. `pages/api/static/[...serve].ts`):

```tsx
import { serve } from '@freshcells/next-static-components'

export default serve(
  async (req, res) => ({ someData: 'myValue' }),
  {
    assetPrefix: 'https://your-domain.com',
    linkPrefix: 'https://your-main-applications-domain.com',
    locale: 'de',
  }
)
```

| Option | Description |
|--------|-------------|
| `assetPrefix` | URL prefix for emitted assets (CDN host). When omitted, relative paths are used. |
| `linkPrefix` | URL prefix used by `useRouter().push()` and link generation. |
| `locale` | Locale to render. Defaults to your `next.config.js` `defaultLocale`. |
| `outputMode` | `'html'` (default), `'jsonp'`, or a custom function `(req, res, { styles, head, content, scripts }) => void`. |

Run `yarn build-static`, then start Next.js. Navigate to `http://localhost:3000/api/static/render` to see the bundle.

### Query-driven options

```ts
export default serve(
  async (req) => ({ /* context */ }),
  async (req) => ({
    locale: (req.query.locale as string) || 'en-gb',
    linkPrefix: 'https://some-domain.com',
  })
)
```

## Detecting the static build

Set `process.env.IS_NEXT_STATIC_BUILD === '1'` is set during the static build and dev server runs. Use it in your `next.config.js` if you need to branch.

## Restrictions

This is an experimental package. The bundle is intentionally minimal and many Next.js optimizations don't apply.

### Router

The client-side Next.js router singleton is not initialized. `useRouter()` returns a context-backed mock with read-only properties (`route`, `pathname`, `query`, `locale`, …) and a `push()` that performs a full navigation via `location.href`.

Do not import the singleton:

```ts
import Router from 'next/router' // ❌ no-op default export
```

Use the hook instead:

```ts
import { useRouter } from 'next/router'
```

### next/head

Head modification at runtime is not supported. Use `additionalHeadElement` on the entrypoint to inject head content at SSR time.

### next/dynamic

Backed by `React.lazy` + `Suspense` instead of webpack's chunk machinery. The shim collects loader promises and `preloadAll()` is awaited before SSR so synchronous rendering works.

Only `dynamic` as the import name is supported:

```ts
import dynamic from 'next/dynamic'                // ✅
import dynamic from '@freshcells/.../next/dynamic' // ❌
```

You cannot chain `import().then()`; map to a component inside the imported file.
