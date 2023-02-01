import webpack, { type Configuration, web } from 'webpack'
import process from 'node:process'
import LoadablePlugin from '@loadable/webpack-plugin'
import { ERROR_NO_RESOLVE, resolveEntry } from '../utils.js'
import path from 'node:path'
import nextJsWebpack from 'next/dist/compiled/webpack/webpack.js'
import { COMPILER_NAMES, PHASE_PRODUCTION_BUILD } from 'next/constants.js'
import { createNextJsWebpackConfig } from './nextjs-webpack-config.js'
import { trace } from 'next/dist/trace/index.js'
import { ReactLoadablePlugin } from 'next/dist/build/webpack/plugins/react-loadable-plugin.js'
import PagesManifestPlugin from 'next/dist/build/webpack/plugins/pages-manifest-plugin.js'
import loadConfig from 'next/dist/server/config.js'
import { TraceEntryPointsPlugin } from 'next/dist/build/webpack/plugins/next-trace-entrypoints-plugin.js'
import { INIT_ENTRY, SHELL_ENTRY, STATIC_PATH } from '../const.js'
interface Args {
  /** the entry point of the application */
  entry: string
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

    const publicPathConfigShell = await resolveEntry('../shell/init.client.js', import.meta.url)

    const applicationShellUrlServer = await resolveEntry(
      '../shell/app-shell.server.js',
      import.meta.url
    )

    // @ts-ignore
    await nextJsWebpack.init()

    // load our nextJS configuration, we only support the production phase for now.
    const config = await loadConfig.default(PHASE_PRODUCTION_BUILD, context)

    // we require to have a "fake" trace instance, without we cannot use any nextJS loaders.
    const runWebpackSpan = trace('static-build')

    const [clientConfig, serverConfig] = await Promise.all([
      createNextJsWebpackConfig(context, runWebpackSpan, COMPILER_NAMES.client, config),
      createNextJsWebpackConfig(context, runWebpackSpan, COMPILER_NAMES.server, config),
    ])

    const clientModule = clientConfig.module
    const serverModule = serverConfig.module

    const nextDynamicShim = await resolveEntry('../next-dynamic-loadable-shim.js', import.meta.url)

    if (!appAlias || !applicationShellUrlClient || !applicationShellUrlServer || !nextDynamicShim) {
      throw new Error(ERROR_NO_RESOLVE)
    }

    const outputPath = path.join(context, '.next-static')
    const webpackCacheFolder = path.join(outputPath, 'cache', 'webpack')

    const baseAliases = {
      '@main': appAlias,
    }

    const baseConfig: Configuration = {
      mode: 'production',
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
            ...serverConfig.resolve.alias,
            ...baseAliases,
          },
        },
        module: {
          ...serverModule,
          parser: {
            ...serverModule.parser,
            javascript: {
              ...serverModule.parser.javascript,
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
          new webpack.NormalModuleReplacementPlugin(/next\/dynamic/, nextDynamicShim),
          new webpack.DefinePlugin({
            'process.env.__NEXT_STATIC_I18N': JSON.stringify(config.i18n || {}),
          }),
          ...serverConfig.plugins
            .filter(
              (plugin: webpack.WebpackPluginInstance) =>
                !(
                  plugin instanceof PagesManifestPlugin.default ||
                  plugin instanceof TraceEntryPointsPlugin
                )
            )
            .map((plugin: webpack.WebpackPluginInstance) => {
              if (plugin instanceof webpack.DefinePlugin) {
                delete plugin.definitions['process.env.__NEXT_I18N_SUPPORT']
                delete plugin.definitions['process.env.__NEXT_ROUTER_BASEPATH']
              }
              return plugin
            }),
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
            ...clientConfig.resolve.alias,
            ...baseAliases,
          },
        },
        output: {
          path: path.join(outputPath, 'client'),
          publicPath: `./${STATIC_PATH}/`,
          filename: 'client-[name].js',
        },
        optimization: clientConfig.optimization,
        plugins: [
          new webpack.NormalModuleReplacementPlugin(/next\/dynamic/, nextDynamicShim),
          ...clientConfig.plugins.filter(
            (plugin: webpack.WebpackPluginInstance) =>
              // we are using @loadable instead of the build in
              !(plugin instanceof ReactLoadablePlugin)
          ),
          new LoadablePlugin.default({
            filename: `../loadable-stats.json`,
            writeToDisk: true,
          }),
        ],
        target: 'web',
      } as Configuration,
    ]
  } catch (e) {
    throw new Error('Unable to build static components.', { cause: e })
  }
}
