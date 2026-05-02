import application from '@main'
import type { NextApiRequest, NextApiResponse } from 'next'
import type { NextStaticData, ServerOptions } from '../types/entrypoint.js'
import React, { ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ApplicationRoot } from './components/ApplicationRoot.js'
import { renderToStringAsync } from './render-to-string.js'
import type { DomainLocale, I18NConfig } from 'next/dist/server/config-shared.js'
import { INIT_ENTRY, SHELL_ENTRY } from '../const.js'
import { sendAsJsonP } from '../server/jsonp.js'
import {
  collectStaticAssets,
  collectRenderedAssets,
  readManifest,
  type CollectedAssets,
  type StaticAssets,
  type ViteManifest,
} from '../build/manifest.js'
import { renderedModulesStore } from '../runtime/record-modules.js'

const setupEnv = (hasLocale: boolean, basePath?: string) => {
  if (hasLocale) {
    process.env.__NEXT_I18N_SUPPORT = '1'
  }
  process.env.__NEXT_ROUTER_BASEPATH = basePath
}

const DefaultWrapper = ({ components }: { components: JSX.Element[] }) => {
  return <>{components}</>
}

const renderTags = ({ entryScripts, modulePreloads, stylesheets }: CollectedAssets) => {
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

const EMPTY_STATIC_ASSETS: StaticAssets = {
  entryScripts: [],
  modulePreloads: [],
  stylesheets: [],
  visited: new Set<string>(),
  seenStyles: new Set<string>(),
}

// Manifest + the static-entry asset walk are stable for a given build —
// cache them so production hits don't redo the file read or the graph walk.
// The per-render rendered-module set still varies per request and is
// resolved against the cached manifest each time.
const manifestCache = new Map<string, ViteManifest>()
const staticAssetsCache = new Map<string, StaticAssets>()

interface ResolvedAssetSources {
  static: StaticAssets
  manifest: ViteManifest | null
  publicPath: string
}

const getAssetSources = (options: ServerOptions): ResolvedAssetSources => {
  if (options.devMode) {
    const dev = options.devAssets
    return {
      static: dev ? { ...dev, visited: new Set(), seenStyles: new Set() } : EMPTY_STATIC_ASSETS,
      manifest: null,
      publicPath: options.publicPath,
    }
  }
  const cacheKey = `${options.clientManifest}::${options.publicPath}`
  let cachedStatic = staticAssetsCache.get(cacheKey)
  let manifest = manifestCache.get(options.clientManifest)
  if (!manifest) {
    manifest = readManifest(options.clientManifest)
    manifestCache.set(options.clientManifest, manifest)
  }
  if (!cachedStatic) {
    cachedStatic = collectStaticAssets(manifest, [INIT_ENTRY, SHELL_ENTRY], options.publicPath)
    staticAssetsCache.set(cacheKey, cachedStatic)
  }
  return { static: cachedStatic, manifest, publicPath: options.publicPath }
}

const mergeRenderedAssets = (
  sources: ResolvedAssetSources,
  rendered: Set<string>,
): CollectedAssets => {
  if (!sources.manifest || rendered.size === 0) {
    return {
      entryScripts: sources.static.entryScripts,
      modulePreloads: sources.static.modulePreloads,
      stylesheets: sources.static.stylesheets,
    }
  }
  const extra = collectRenderedAssets(
    sources.manifest,
    rendered,
    sources.publicPath,
    sources.static,
  )
  return {
    entryScripts: sources.static.entryScripts,
    modulePreloads: [...sources.static.modulePreloads, ...extra.modulePreloads],
    stylesheets: [...sources.static.stylesheets, ...extra.stylesheets],
  }
}

export default async function (
  req: NextApiRequest,
  res: NextApiResponse,
  context: Record<string, unknown>,
  options: ServerOptions,
) {
  const { props, components, wrapper, additionalHeadElement } = await application(context)

  const thisOutputMode = options.outputMode || 'html'
  const assetSources = getAssetSources(options)
  const renderedModules = new Set<string>()

  const envI18N = process.env.__NEXT_STATIC_I18N as unknown
  const { locales, defaultLocale, domains } = (
    envI18N && typeof envI18N === 'object' ? envI18N : {}
  ) as Partial<I18NConfig>
  const basePath =
    process.env.__NEXT_ROUTER_BASEPATH !== 'undefined'
      ? process.env.__NEXT_ROUTER_BASEPATH
      : undefined

  // Use the merged defaultLocale (servingOptions ∪ next.config.i18n) — Next's
  // `<Link>` only generates absolute domain-locale URLs when
  // `__NEXT_I18N_SUPPORT` is set (see `next/dist/client/get-domain-locale.js`).
  const mergedDefaultLocale = options.defaultLocale || defaultLocale
  setupEnv(typeof mergedDefaultLocale === 'string', basePath)

  const NEXT_STATIC_DATA: NextStaticData = {
    runtimeConfig: {},
    publicAssetPath: `${options.publicPath}/`,
    defaultLocale: mergedDefaultLocale,
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

  const renderedApp = await renderedModulesStore.run(renderedModules, async () => {
    const renderedHtml = await Promise.all(
      components.map((Component, index) => renderToStringAsync(wrapForRoot(Component, index))),
    )

    const renderedComponents = renderedHtml.map((html, index) => (
      <div
        key={`cmp-${index}`}
        data-next-static-root="true"
        data-next-static-index={index}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    ))

    return renderToStaticMarkup(
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
      </ApplicationRoot>,
    )
  })

  const { Styles, Links, EntryScripts } = renderTags(
    mergeRenderedAssets(assetSources, renderedModules),
  )

  const { runtimeConfig, publicAssetPath, query, ...restConfig } = NEXT_STATIC_DATA
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
    return sendAsJsonP({ styles: stylesHtml, content: renderedApp, scripts: scriptsHtml }, res, req)
  }

  if (typeof thisOutputMode === 'function') {
    return thisOutputMode(req, res, {
      styles: stylesHtml,
      head: renderToStaticMarkup(
        <>
          <meta charSet="utf-8" />
          <Links />
          {additionalHeadElement}
        </>,
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
        <div data-next-static-outer-root="true" dangerouslySetInnerHTML={{ __html: renderedApp }} />
        <Scripts />
      </body>
    </html>
  )

  res.send(renderToStaticMarkup(<Outer />))
  res.end()
}
