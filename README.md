@freshcells/next-static-components
----------------------------------

[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
![npm](https://img.shields.io/npm/v/@freshcells/next-static-components)

**Experimental** Utility to allow rendering parts of a next.js application (e.g. Header & Footer)
for embedding into third party applications.

## Install

```
yarn add @freshcells/next-static-components
```

## Requirements

- `nextjs`, tested only with `12.x`.
- `node` >= `16.x`, recommended is `node` >= `18.x`

## Usage

Add the following script to your application

```json
{
  "scripts": {
    "build-static": "cross-env BABEL_ENV=static NODE_OPTIONS='--experimental-import-meta-resolve' next-static-components ./static-page/entrypoint.tsx"
  }
}
```

This command will dump all compilation output into a new folder called `.next-static`.
Make sure you include this folder into your build process / Dockerfile.

### Caching

Webpack is configured to cache, so you may want to integrate
the `.next-static/cache/webpack` folder into your CI/CD process.

### Babel configuration

If not exists, please create a `babel.config.js` or `.babelrc` with the following:

```js
module.exports = {
    // if defined, please move `next/babel` from the generic definitions into it's own preset
    env: {
        // used for nextjs (e.g. dev, build etc.)
        nextjs: {
            presets: ['next/babel'],
        },
        // adapted preset to be used for the static component build
        static: {
            presets: ['@freshcells/next-static-components/babel'],
        }
    }
}
```

### NextJS configuration / custom loaders & webpack

We try to infer most configuration from your nextJS configuration.
In case you require to exclude certain configuration from the static build you can use
the `process.env.IS_NEXT_STATIC_BUILD` env to detect a static build.

### Entrypoint

We require a single entrypoint where you define all your static components.
In the example above we created a file `static-page/entrypoint.tsx`.

It should export a single function in the following form.

```tsx
import React from 'react'
import type {Entrypoint, WrapperProps} from '@freshcells/next-static-components'

// .. import anything from your application ..

interface YourContext {
    someData: string
}

interface YourProps {
    someData: string
}

const Header = (props: YourProps) => {
    return <p>My Header</p>
}

const Footer = (props: YourProps) => {
    return <p>My Footer</p>
}

const entry: Entrypoint<YourProps, YourContext> = async (context: YourContext) => {
    // initialize your application here
    return {
        // Will be passed to each component
        props: context,
        // A list of components to be mounted on a page (with different roots)
        components: [Header, Footer],
        // optional wrapper component that lets you customize the markup.
        // By default it will render both components after another (always in a wrapper div)
        wrapper: function MyWrapper({components}: WrapperProps) {
            const [header, footer] = components
            return (
                <div>
                    {header}
                    <div>something in between</div>
                    {footer}
                </div>
            )
        }
    }
}

export default entry
```

### Expose your static components

Create a new `API` route, e.g. in `pages/api/static/[...serve].ts`.
It's very important to use `[...xxxx]` as we will also serve assets and the frontend js bundles
from this path.

```tsx
import {serve} from '@freshcells/next-static-components'

export default serve(
    /* context provider, all data will be passed to both frontend and backend */
    async (req, res) => ({someData: 'myValue'}),
    /* options, static or cb */
    /* or cb async (req, res) => ({ locale: req.query.locale }) */
    {
        // the following options are for prod only, will serve from localhost in development
        // the domain where all assets are served from 
        assetPrefix: 'https://your-domain.com',
        // the prefix that should be used to render links. Has to be a valid URL.
        linkPrefix: 'https://your-main-applications-domain.com',

        locale: 'de' // (defaults to the `defaultLocale` set or `en` if no i18n config present)
    }
)
```

| Option        | Description                                                                                                                                                            |
|---------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `assetPrefix` | The prefix to add for asset generation (e.g. a cdn url). If omitted will use the relative path                                                                         |
| `linkPrefix`  | Prefix to add to any link, if omitted will use a relative path (relative to `/`)                                                                                       |
| `locale`      | The locale to use to render the page. Will use the configured `defaultLocale` if omitted. Other settings like `locales` will be inferred from the nextJS configuration |

Run `yarn build-static` and start your application (you can also run it after).
If you now navigate to http://localhost:3000/api/static/render you should see your rendered
components.

#### Query Parameters

You can provide your own query parameters and customize both the provided `context` and `options` (
e.g. you could make the locale configurable through the url)

##### Example:

```ts
export default serve(
    async (req) => {
        const myQuery = req.query?.yourQuery
        // ... do something with myQuery
        return {}
    },
    async (req) =>
        ({linkPrefix: 'https://some-domain.com', locale: req.query?.locale as string || 'en-gb'})
)
```

#### Development

**Important**: There is currently no hot-reload or develop mode for static generation, so you have
to rebuild if you make any change.

### Ignore

Add `.next-static` to you `.gitignore` file.

### Restrictions

This is a very experimental package to support a certain use case most projects probably won't have.
Not all nextJS features might be supported - and the output of the bundle is very different to
the main application. Many optimizations are not applied. The main difference is
that we use `@loadable` to resolve dynamic packages (defined with `next/dynamic`).

#### Router

The client side router is not created due to inaccessible singleton instances inside a module (
see, https://github.com/vercel/next.js/blob/98b43a07094e6df2bd40cf0e190708751ead3537/packages/next/src/client/router.ts#L153-L153)
so any calls to it will result in an exception.

You may use only `<Link />`, `useRouter()` etc. but do not access `Router.push`, `Router.asPath`
methods
directly (e.g. from `import Router from 'next/router'`)

#### next/head

Modification of the `head` element is unsupported. The usage within the static tree is a no-op.

#### next/dynamic

As we replace the dynamic module resolution from `next/dynamic` with `@loadable/component`, there
are certain restrictions to the API.

All options (e.g. `ssr` or `loader` are supported).

##### Naming

Only `dynamic` as import name is supported.

***Do***:

```tsx
import dynamic from 'next/dynamic'
```

***Do-Not***:

```tsx
import myDynamic from 'next/dynamic'
```

##### Promise chaining

You cannot chain the `import(...)` promise. If you need to map the result to a component
you have to map that inside the imported file. So you might need to refactor your implementation. As
this is a very small tradeoff we did not invest time in making the API 100% compatible.

***Do***:

```tsx
import dynamic from 'next/dynamic'

const MyDynamicComponent = dynamic(() => import('./MyComponent'))
```

***Do-Not***:

```tsx
import dynamic from 'next/dynamic'

// the `then` part will never be called on the server side, so it might return not a component but something else (based on your implementation)
const MyDynamicComponent = dynamic(() => import('./myData').then(data => mapToComponent(data)))
```
