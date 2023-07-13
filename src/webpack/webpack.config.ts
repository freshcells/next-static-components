import webpack, {
  type Configuration,
  web,
  WebpackPluginInstance,
} from 'webpack'
import process from 'node:process'
import LoadablePlugin from '@loadable/webpack-plugin'
import { ERROR_NO_RESOLVE, resolveEntry } from '../utils.js'
import path from 'node:path'
import nextJsWebpack from 'next/dist/compiled/webpack/webpack.js'
import constPkg from 'next/constants.js'
import { createNextJsWebpackConfig } from './nextjs-webpack-config.js'
import tracePkg from 'next/dist/trace/index.js'
import { ReactLoadablePlugin } from 'next/dist/build/webpack/plugins/react-loadable-plugin.js'
import PagesManifestPlugin from 'next/dist/build/webpack/plugins/pages-manifest-plugin.js'
import loadConfig from 'next/dist/server/config.js'
import { TraceEntryPointsPlugin } from 'next/dist/build/webpack/plugins/next-trace-entrypoints-plugin.js'
import { INIT_ENTRY, SHELL_ENTRY, STATIC_PATH } from '../const.js'

const { COMPILER_NAMES, PHASE_PRODUCTION_BUILD } = constPkg
const { trace } = tracePkg

interface Args {
  /** the entry point of the application */
  entry: string
  cacheSuffix?: string
}

export const parallelism = 2

export default async (env: Args) => {
  try {
    const context = process.cwd()
    const contextAsFile = `file://${context}/`
    const appAlias = await resolveEntry(env.entry, contextAsFile)

    const applicationShellUrlClient = await resolveEntry(
      '../shell/app-shell.client.js',
      import.meta.url
    )

    const publicPathConfigShell = await resolveEntry(
      '../shell/init.client.js',
      import.meta.url
    )

    const applicationShellUrlServer = await resolveEntry(
      '../shell/app-shell.server.js',
      import.meta.url
    )

    const errorLoaderShim = await resolveEntry(
      '../webpack/error-loader.shim.js',
      import.meta.url
    )

    // @ts-ignore
    await nextJsWebpack.init()

    // load our nextJS configuration, we only support the production phase for now.
    const config = await loadConfig.default(PHASE_PRODUCTION_BUILD, context)

    // we require to have a "fake" trace instance, without we cannot use any nextJS loaders.
    const runWebpackSpan = trace('static-build')

    const [clientConfig, serverConfig] = await Promise.all([
      createNextJsWebpackConfig(
        context,
        runWebpackSpan,
        COMPILER_NAMES.client,
        config
      ),
      createNextJsWebpackConfig(
        context,
        runWebpackSpan,
        COMPILER_NAMES.server,
        config
      ),
    ])

    const clientModule = clientConfig.module
    const serverModule = serverConfig.module

    const nextDynamicShim = await resolveEntry(
      '../next-dynamic-loadable-shim.js',
      import.meta.url
    )

    if (
      !appAlias ||
      !applicationShellUrlClient ||
      !applicationShellUrlServer ||
      !nextDynamicShim
    ) {
      throw new Error(ERROR_NO_RESOLVE)
    }

    const outputPath = path.join(context, '.next-static')
    const baseCacheFolder = path.join(outputPath, 'cache', 'webpack')
    const webpackCacheFolder = env.cacheSuffix
      ? path.join(baseCacheFolder, env.cacheSuffix)
      : baseCacheFolder

    const baseAliases = {
      '@main': appAlias,
    }

    const baseConfig: Configuration = {
      mode: 'production',
    }

    // We have to patch some of the sass / css behaviour to have support for global imports which are not inside the _app.js / _app.tsx file

    // let's find all css loaders
    const nextCssLoaders = clientModule?.rules?.find(
      (rule) => typeof (rule as webpack.RuleSetRule).oneOf === 'object'
    ) as webpack.RuleSetRule

    // Let's find the nextjs original sass loader definition
    const nextSassLoader = nextCssLoaders?.oneOf?.find(
      (rule: webpack.RuleSetRule) =>
        rule.sideEffects === false &&
        rule.test?.toString() === /\.module\.(scss|sass)$/.toString()
    ) as webpack.RuleSetRule

    // apply rules to all scss files
    nextSassLoader.test = /(\.scss|\.sass)$/

    const cssLoader = (nextSassLoader?.use as webpack.RuleSetUseItem[])?.find(
      (loader) => {
        if (typeof loader === 'object') {
          return loader.loader?.match(/css-loader/)
        }
        return false
      }
    )

    if (typeof cssLoader === 'object') {
      if (typeof cssLoader!.options === 'object') {
        if (cssLoader?.options?.modules)
          cssLoader!.options!.modules = {
            ...cssLoader!.options!.modules,
            auto: true,
          }
      }
    }

    return [
      // server/node bundle
      {
        cache: {
          type: 'filesystem',
          cacheDirectory: webpackCacheFolder,
          name: 'server',
        },
        ...baseConfig,
        resolve: {
          ...serverConfig.resolve,
          alias: {
            ...serverConfig?.resolve?.alias,
            ...baseAliases,
          },
        },
        module: {
          ...serverModule,
          parser: {
            ...serverModule?.parser,
            javascript: {
              ...serverModule?.parser?.javascript,
              dynamicImportMode: 'eager',
            },
          },
        },
        entry: applicationShellUrlServer,
        externalsPresets: serverConfig.externalsPresets,
        externals: serverConfig.externals,
        output: {
          publicPath: `./${STATIC_PATH}/`,
          path: path.join(outputPath, 'server'),
          library: {
            type: 'commonjs2',
          },
          libraryTarget: 'commonjs2',
          filename: 'node-[name].js',
        },
        target: serverConfig.target,
        plugins: [
          new webpack.NormalModuleReplacementPlugin(
            /next\/dynamic/,
            nextDynamicShim
          ),
          new webpack.DefinePlugin({
            'process.env.__NEXT_STATIC_I18N': JSON.stringify(config.i18n || {}),
          }),
          ...(serverConfig?.plugins
            ?.filter(
              (plugin: webpack.WebpackPluginInstance) =>
                !(
                  plugin instanceof PagesManifestPlugin.default ||
                  plugin instanceof TraceEntryPointsPlugin
                )
            )
            ?.map((plugin: webpack.WebpackPluginInstance) => {
              if (plugin instanceof webpack.DefinePlugin) {
                // we have to define these envs, as we do not transpile any next dependencies
                delete plugin.definitions['process.env.__NEXT_I18N_SUPPORT']
                delete plugin.definitions['process.env.__NEXT_ROUTER_BASEPATH']
              }
              return plugin
            }) || []),
          // output only a single file (we don't need to split on the server)
          new webpack.optimize.LimitChunkCountPlugin({
            maxChunks: 1,
          }),
        ],
      } as Configuration,
      // client bundle:
      {
        cache: {
          type: 'filesystem',
          cacheDirectory: webpackCacheFolder,
          name: 'client',
        },
        ...baseConfig,
        module: clientModule,
        resolveLoader: clientConfig.resolveLoader,
        entry: {
          [INIT_ENTRY]: publicPathConfigShell,
          [SHELL_ENTRY]: {
            import: applicationShellUrlClient,
            dependOn: INIT_ENTRY,
          },
        },
        resolve: {
          ...clientConfig.resolve,
          alias: {
            ...clientConfig?.resolve?.alias,
            ...baseAliases,
          },
        },
        output: {
          path: path.join(outputPath, 'client'),
          publicPath: `./${STATIC_PATH}/`,
          filename: '[name].[contenthash].js',
        },
        optimization: clientConfig.optimization,
        plugins: [
          new webpack.NormalModuleReplacementPlugin(
            /next\/dynamic/,
            nextDynamicShim
          ),
          ...(clientConfig?.plugins?.filter(
            (plugin: webpack.WebpackPluginInstance) =>
              // we are using @loadable instead of the build in
              !(plugin instanceof ReactLoadablePlugin)
          ) || []),
          new LoadablePlugin.default({
            filename: `../loadable-stats.json`,
            writeToDisk: true,
          }) as WebpackPluginInstance,
        ],
        target: 'web',
      } as Configuration,
    ]
  } catch (e) {
    throw new Error('[next-static] Unable to build static components.', {
      cause: e,
    })
  }
}
