import application from '@main'
import type { NextApiRequest, NextApiResponse } from 'next'
import type { NextStaticData, ServerOptions } from '../types/entrypoint.js'
import { ChunkExtractor } from '@loadable/server'
import React, { ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import getConfig from 'next/config.js'
import { ApplicationRoot } from './components/ApplicationRoot.js'
import { preloadAll } from '../next-dynamic-loadable-shim.js'
import { I18NConfig } from 'next/dist/server/config-shared.js'
import { INIT_ENTRY, SHELL_ENTRY } from '../const.js'
import { sendAsJsonP } from '../server/jsonp.js'

const setupEnv = (hasLocale: boolean, basePath?: string) => {
  if (hasLocale) {
    process.env.__NEXT_I18N_SUPPORT = '1'
  }
  process.env.__NEXT_ROUTER_BASEPATH = basePath
}

const DefaultWrapper = ({ components }: { components: JSX.Element[] }) => {
  return <>{components}</>
}

export default async function (
  req: NextApiRequest,
  res: NextApiResponse,
  context: Record<string, unknown>,
  options: ServerOptions
) {
  const { props, components, wrapper, additionalHeadElement } =
    await application(context)
  // We have to make sure that all dynamic imports are resolved
  await preloadAll()

  const thisOutputMode = options.outputMode || 'html'

  const chunkExtractor = new ChunkExtractor({
    statsFile: options.loadableStats,
    publicPath: options.publicPath,
    entrypoints: [INIT_ENTRY, SHELL_ENTRY],
  })

  const { locales, defaultLocale, domains } = process.env
    .__NEXT_STATIC_I18N as unknown as Partial<I18NConfig>
  const basePath =
    process.env.__NEXT_ROUTER_BASEPATH !== 'undefined'
      ? process.env.__NEXT_ROUTER_BASEPATH
      : undefined

  setupEnv(typeof defaultLocale === 'string', basePath)

  const NEXT_STATIC_DATA: NextStaticData = {
    runtimeConfig: getConfig.default().publicRuntimeConfig,
    publicAssetPath: `${options.publicPath}/`,
    defaultLocale: options.defaultLocale || defaultLocale,
    locale: options.locale || defaultLocale,
    assetPrefix: options.assetPrefix,
    locales: options.locales || locales,
    basePath,
    domains: options.domains || domains,
    nodeEnv: options.nodeEnv,
    linkPrefix: options.linkPrefix,
    query: options.query,
    context,
  }

  let Wrapper = wrapper || DefaultWrapper

  const Application = chunkExtractor.collectChunks(
    <ApplicationRoot
      locale={NEXT_STATIC_DATA.locale}
      domains={NEXT_STATIC_DATA.domains}
      defaultLocale={NEXT_STATIC_DATA.defaultLocale}
      locales={NEXT_STATIC_DATA.locales}
      basePath={basePath}
      linkPrefix={options.linkPrefix}
      query={options.query}
    >
      {
        <Wrapper
          components={components.map(
            (Component: ComponentType, index: number) => (
              <div
                key={`cmp-${index}`}
                data-next-static-root="true"
                data-next-static-index={index}
              >
                <Component {...props} />
              </div>
            )
          )}
        />
      }
    </ApplicationRoot>
  )

  const renderedApp = renderToStaticMarkup(Application)

  const Scripts = () => (
    <>
      {chunkExtractor.getScriptElements()}
      <script
        id="__NEXT_STATIC_DATA__"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(NEXT_STATIC_DATA) }}
      />
    </>
  )

  if (thisOutputMode === 'jsonp') {
    return sendAsJsonP(
      {
        styles: chunkExtractor.getStyleTags(),
        content: renderedApp,
        scripts: renderToStaticMarkup(<Scripts />),
      },
      res,
      req
    )
  }

  const Body = () => (
    <>
      {chunkExtractor.getStyleElements()}
      <div
        data-next-static-outer-root="true"
        dangerouslySetInnerHTML={{ __html: renderedApp }}
      />
      <Scripts />
    </>
  )

  const Outer = () => (
    <html>
      <head>
        <meta charSet="utf-8" />
        {chunkExtractor.getLinkElements()}
        {additionalHeadElement}
      </head>
      <body>
        <Body />
      </body>
    </html>
  )

  res.send(renderToStaticMarkup(<Outer />))
  res.end()
}
