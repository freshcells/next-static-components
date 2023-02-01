import createBaseWebpackConfig from 'next/dist/build/webpack-config.js'
import { NextConfigComplete } from 'next/dist/server/config-shared.js'
import { CompilerNameValues } from 'next/dist/shared/lib/constants.js'
import { Span } from 'next/dist/trace/index.js'
import { findPagesDir } from 'next/dist/lib/find-pages-dir.js'

export const createNextJsWebpackConfig = async (
  appDirectory: string,
  runWebpackSpan: Span,
  compilerType: CompilerNameValues,
  config: NextConfigComplete
) => {
  const isAppDirEnabled = !!config.experimental.appDir
  const { pages, appDir } = findPagesDir(appDirectory, isAppDirEnabled)

  return await createBaseWebpackConfig.default(appDirectory, {
    appDir: appDir,
    dev: false,
    compilerType,
    buildId: 'next-static',
    hasReactRoot: false,
    middlewareMatchers: [],
    isDevFallback: false,
    runWebpackSpan,
    pagesDir: pages,
    entrypoints: [],
    config: {
      ...config,
      // this is only used for resources inside css files.
      // It's easier to just define the asset prefix here, as the definition of the `publicPath` is deeply buried inside the loader's configs:
      // see https://github.com/vercel/next.js/blob/98b43a07094e6df2bd40cf0e190708751ead3537/packages/next/src/build/webpack/config/blocks/css/loaders/client.ts#L45-L45
      assetPrefix: '../../../',
      optimizeFonts: false,
    },
    rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
  })
}
