import rspack from '@next/rspack-core'
import type {
  FileCacheOptions,
  Configuration as WebpackConfiguration,
} from 'webpack'
import type {
  Configuration,
  WebpackPluginInstance,
  RuleSetRule,
  RuleSetUseItem,
} from '@rspack/core'

import process from 'node:process'
import LoadablePlugin from '@loadable/webpack-plugin'
import { ERROR_NO_RESOLVE, resolveEntry } from '../utils.js'
import path from 'node:path'
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
  clientAliases?: NonNullable<Configuration['resolve']>['alias']
}

export const parallelism = 2

export default async (env: Args) => {
  try {
    const context = process.cwd()
    const contextAsFile = `file://${context}/`
    const appAlias = await resolveEntry(env.entry, contextAsFile)
    const customClientAliases = env.clientAliases || {}

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

    const nextRouterShim = await resolveEntry(
      '../next-router-shim.js',
      import.meta.url
    )

    const routerContextShim = await resolveEntry(
      '../context.js',
      import.meta.url
    )

    if (
      !appAlias ||
      !applicationShellUrlClient ||
      !applicationShellUrlServer ||
      !nextDynamicShim ||
      !nextRouterShim ||
      !routerContextShim
    ) {
      throw new Error(ERROR_NO_RESOLVE)
    }

    const outputPath = path.join(context, '.next-static')
    // Note `webpack` is just used here for legacy reasons, this is the rspack cache folder.
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
      (rule) => typeof (rule as RuleSetRule).oneOf === 'object'
    ) as RuleSetRule

    // Let's find the nextjs original sass loader definition
    const nextSassLoader = nextCssLoaders?.oneOf?.find(
      (rule) =>
        rule &&
        'test' in rule &&
        rule?.test?.toString() === /\.module\.(scss|sass)$/.toString()
    ) as RuleSetRule

    // apply rules to all scss files
    nextSassLoader.test = /(\.scss|\.sass)$/

    const cssLoader = (nextSassLoader?.use as RuleSetUseItem[])?.find(
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

    const webpackServerConfig = serverConfig as WebpackConfiguration
    const webpackClientConfig = clientConfig as WebpackConfiguration
    return [
      // server/node bundle
      {
        cache: true,
        experiments: {
          cache: {
            type: 'persistent',
            version: `server-${
              (webpackServerConfig.cache as FileCacheOptions).version
            }`,
            storage: {
              type: 'filesystem',
              directory: webpackCacheFolder,
            },
          },
        },
        ...baseConfig,
        resolve: {
          ...serverConfig.resolve,
          tsConfig: path.resolve(context, './tsconfig.json'),
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
          new rspack.NormalModuleReplacementPlugin(
            /next\/dynamic/,
            nextDynamicShim
          ),
          new rspack.NormalModuleReplacementPlugin(
            /next\/router/,
            nextRouterShim
          ),
          new rspack.NormalModuleReplacementPlugin(
            /lib\/router-context\.shared-runtime/,
            routerContextShim
          ),
          new rspack.DefinePlugin({
            'process.env.__NEXT_STATIC_I18N': JSON.stringify(config.i18n || {}),
          }),
          ...(serverConfig?.plugins
            ?.filter(
              (plugin) =>
                !(
                  plugin instanceof PagesManifestPlugin.default ||
                  plugin instanceof TraceEntryPointsPlugin
                )
            )
            ?.map((plugin) => {
              if (plugin instanceof rspack.DefinePlugin) {
                // we have to define these envs, as we do not transpile any next dependencies
                delete plugin._args[0]['process.env.__NEXT_I18N_SUPPORT']
                delete plugin._args[0]['process.env.__NEXT_ROUTER_BASEPATH']
              }
              return plugin
            }) || []),
          // output only a single file (we don't need to split on the server)
          new rspack.optimize.LimitChunkCountPlugin({
            maxChunks: 1,
          }),
        ],
      } as Configuration,
      // client bundle:
      {
        cache: true,
        experiments: {
          cache: {
            type: 'persistent',
            version: `client-${JSON.stringify(customClientAliases)}-${
              (webpackClientConfig.cache as FileCacheOptions).version
            }`,
            storage: {
              type: 'filesystem',
              directory: webpackCacheFolder,
            },
          },
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
          tsConfig: path.resolve(context, './tsconfig.json'),
          alias: {
            ...clientConfig?.resolve?.alias,
            ...baseAliases,
            ...customClientAliases,
          },
        },
        output: {
          path: path.join(outputPath, 'client'),
          publicPath: `./${STATIC_PATH}/`,
          filename: '[name].[contenthash].js',
        },
        optimization: clientConfig.optimization,
        plugins: [
          new rspack.NormalModuleReplacementPlugin(
            /next\/dynamic/,
            nextDynamicShim
          ),
          new rspack.NormalModuleReplacementPlugin(
            /next\/router/,
            nextRouterShim
          ),
          ...(clientConfig?.plugins?.filter(
            (plugin) =>
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
