import createBaseWebpackConfig from 'next/dist/build/webpack-config.js'
import { NextConfigComplete } from 'next/dist/server/config-shared.js'
import { CompilerNameValues } from 'next/dist/shared/lib/constants.js'
import { Span } from 'next/dist/trace/index.js'
import findPagesDirPkg from 'next/dist/lib/find-pages-dir.js'
import semver from 'semver'
import packageJson from 'next/package.json' assert { type: 'json' }

const { findPagesDir } = findPagesDirPkg

const IS_NEXT_13 = semver.gte(packageJson.version, '13.0.0')

type WebpackConfigFactory = Parameters<typeof createBaseWebpackConfig.default>

export const createNextJsWebpackConfig = async (
  appDirectory: string,
  runWebpackSpan: Span,
  compilerType: CompilerNameValues,
  config: NextConfigComplete
) => {
  const isAppDirEnabled = !!config.experimental.appDir
  const { appDir, ...rest } = findPagesDir(appDirectory, isAppDirEnabled)

  const pagesDir = IS_NEXT_13 ? rest.pagesDir : (rest as any).pages

  let next13Configs = {}

  if (IS_NEXT_13) {
    const { default: thisDefault } = await import(
      'next/dist/build/webpack-config.js'
    )
    const { loadProjectInfo } = thisDefault
    const { supportedBrowsers, resolvedBaseUrl, jsConfig } =
      await loadProjectInfo({
        dir: appDirectory,
        config,
        dev: false,
      })
    next13Configs = {
      supportedBrowsers,
      resolvedBaseUrl,
      jsConfig,
      clientRouterFilters: {},
      originalRedirects: [],
      originalRewrites: {
        afterFiles: [],
        beforeFiles: [],
        fallback: [],
      },
    }
  }

  return await createBaseWebpackConfig.default(appDirectory, {
    appDir: appDir,
    dev: false,
    compilerType,
    // next-13 start (will be overwritten)
    resolvedBaseUrl: appDirectory,
    jsConfig: {},
    supportedBrowsers: [],
    // next-13 end
    buildId: 'next-static',
    middlewareMatchers: [],
    isDevFallback: false,
    runWebpackSpan,
    pagesDir,
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
    ...next13Configs,
  } as unknown as WebpackConfigFactory[1])
}
