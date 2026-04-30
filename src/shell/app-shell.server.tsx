import application from '@main'
import type { NextApiRequest, NextApiResponse } from 'next'
import type { NextStaticData, ServerOptions } from '../types/entrypoint.js'
import React, { ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ApplicationRoot } from './components/ApplicationRoot.js'
import { renderToStringAsync } from './render-to-string.js'
import type {
  DomainLocale,
  I18NConfig,
} from 'next/dist/server/config-shared.js'
import { INIT_ENTRY, SHELL_ENTRY } from '../const.js'
import { sendAsJsonP } from '../server/jsonp.js'
import {
  collectAssets,
  readManifest,
  type CollectedAssets,
  type ViteManifest,
} from '../build/manifest.js'

const setupEnv = (hasLocale: boolean, basePath?: string) => {
  if (hasLocale) {
    process.env.__NEXT_I18N_SUPPORT = '1'
  }
  process.env.__NEXT_ROUTER_BASEPATH = basePath
}

const DefaultWrapper = ({ components }: { components: JSX.Element[] }) => {
  return <>{components}</>
}

const renderTags = ({
  entryScripts,
  modulePreloads,
  stylesheets,
}: CollectedAssets) => {
  const Styles = () => (
    <>
      {stylesheets.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
    </>
  )
  const Links = () => (
    <>
      {modulePreloads.map((href) => (
        <link key={href} rel="modulepreload" href={href} />
      ))}
    </>
  )
  const EntryScripts = () => (
    <>
      {entryScripts.map((src) => (
        <script key={src} type="module" src={src} />
      ))}
    </>
  )
  return { Styles, Links, EntryScripts }
}

const EMPTY_ASSETS: CollectedAssets = {
  entryScripts: [],
  modulePreloads: [],
  stylesheets: [],
}

// Manifest contents and the asset graph for our two known entries are
// stable for a given build — cache by manifest path so production hits
// don't redo the file read + graph walk on every request.
const manifestCache = new Map<string, ViteManifest>()
const assetsCache = new Map<string, CollectedAssets>()

const getAssets = (options: ServerOptions): CollectedAssets => {
  if (options.devMode) return options.devAssets || EMPTY_ASSETS
  const cacheKey = `${options.clientManifest}::${options.publicPath}`
  let cached = assetsCache.get(cacheKey)
  if (cached) return cached
  let manifest = manifestCache.get(options.clientManifest)
  if (!manifest) {
    manifest = readManifest(options.clientManifest)
    manifestCache.set(options.clientManifest, manifest)
  }
  cached = collectAssets(
    manifest,
    [INIT_ENTRY, SHELL_ENTRY],
    options.publicPath
  )
  assetsCache.set(cacheKey, cached)
  return cached
}

export default async function (
  req: NextApiRequest,
  res: NextApiResponse,
  context: Record<string, unknown>,
  options: ServerOptions
) {
  const { props, components, wrapper, additionalHeadElement } =
    await application(context)

  const thisOutputMode = options.outputMode || 'html'
  const { Styles, Links, EntryScripts } = renderTags(getAssets(options))

  const envI18N = process.env.__NEXT_STATIC_I18N as unknown
  const { locales, defaultLocale, domains } = (envI18N &&
  typeof envI18N === 'object'
    ? envI18N
    : {}) as Partial<I18NConfig>
  const basePath =
    process.env.__NEXT_ROUTER_BASEPATH !== 'undefined'
      ? process.env.__NEXT_ROUTER_BASEPATH
      : undefined

  setupEnv(typeof defaultLocale === 'string', basePath)

  const NEXT_STATIC_DATA: NextStaticData = {
    runtimeConfig: {},
    publicAssetPath: `${options.publicPath}/`,
    defaultLocale: options.defaultLocale || defaultLocale,
    locale: options.locale || defaultLocale,
    assetPrefix: options.assetPrefix,
    locales: options.locales || (locales as string[] | undefined),
    basePath,
    domains: options.domains || (domains as DomainLocale[] | undefined),
    nodeEnv: options.nodeEnv,
    linkPrefix: options.linkPrefix,
    query: options.query,
    context,
  }

  let Wrapper = wrapper || DefaultWrapper

  // Render each component in its own ApplicationRoot so React's useId()
  // generates IDs in the same tree depth that `app-shell.client.tsx` will
  // see when it calls `hydrateRoot` per component. A shared root would
  // produce position-encoded IDs that don't match per-root hydration.
  const wrapForRoot = (Component: ComponentType, index: number) => (
    <ApplicationRoot
      locale={NEXT_STATIC_DATA.locale}
      domains={NEXT_STATIC_DATA.domains}
      defaultLocale={NEXT_STATIC_DATA.defaultLocale}
      locales={NEXT_STATIC_DATA.locales}
      basePath={basePath}
      linkPrefix={options.linkPrefix}
      query={options.query}
    >
      <Component key={`cmp-${index}`} {...props} />
    </ApplicationRoot>
  )

  const renderedHtml = await Promise.all(
    components.map((Component, index) =>
      renderToStringAsync(wrapForRoot(Component, index))
    )
  )

  const renderedComponents = renderedHtml.map((html, index) => (
    <div
      key={`cmp-${index}`}
      data-next-static-root="true"
      data-next-static-index={index}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  ))

  // Outer wrapper renders the user's `wrapper` component (which may use
  // useRouter etc.) around already-rendered component HTML. Hydration
  // happens per data-next-static-root child div, so this outer tree only
  // needs to emit static markup.
  const renderedApp = renderToStaticMarkup(
    <ApplicationRoot
      locale={NEXT_STATIC_DATA.locale}
      domains={NEXT_STATIC_DATA.domains}
      defaultLocale={NEXT_STATIC_DATA.defaultLocale}
      locales={NEXT_STATIC_DATA.locales}
      basePath={basePath}
      linkPrefix={options.linkPrefix}
      query={options.query}
    >
      <Wrapper components={renderedComponents} />
    </ApplicationRoot>
  )

  const { runtimeConfig, publicAssetPath, query, ...restConfig } =
    NEXT_STATIC_DATA
  const Scripts = () => (
    <>
      <script
        id="__NEXT_STATIC_INFO__"
        type="application/json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({ runtimeConfig, publicAssetPath, query }),
        }}
      />
      <EntryScripts />
      <script
        id="__NEXT_STATIC_DATA__"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(restConfig) }}
      />
    </>
  )

  const stylesHtml = renderToStaticMarkup(<Styles />)
  const scriptsHtml = renderToStaticMarkup(<Scripts />)

  if (thisOutputMode === 'jsonp') {
    return sendAsJsonP(
      { styles: stylesHtml, content: renderedApp, scripts: scriptsHtml },
      res,
      req
    )
  }

  if (typeof thisOutputMode === 'function') {
    return thisOutputMode(req, res, {
      styles: stylesHtml,
      head: renderToStaticMarkup(
        <>
          <meta charSet="utf-8" />
          <Links />
          {additionalHeadElement}
        </>
      ),
      content: renderedApp,
      scripts: scriptsHtml,
    })
  }

  const Outer = () => (
    <html>
      <head>
        <meta charSet="utf-8" />
        <Links />
        {additionalHeadElement}
      </head>
      <body>
        <Styles />
        <div
          data-next-static-outer-root="true"
          dangerouslySetInnerHTML={{ __html: renderedApp }}
        />
        <Scripts />
      </body>
    </html>
  )

  res.send(renderToStaticMarkup(<Outer />))
  res.end()
}
