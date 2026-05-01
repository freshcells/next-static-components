import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import type { InlineConfig, PluginOption } from 'vite'
import reactSwc from '@vitejs/plugin-react-swc'
import { mainEntryPlugin } from './plugins/main-entry.js'
import { importExcludePlugin } from './plugins/import-exclude.js'
import { overrideAliasesPlugin } from './plugins/override-aliases.js'
import { cssDefaultExportPlugin } from './plugins/css-default-export.js'
import { recordImportsPlugin } from './plugins/record-imports.js'
import { nextImagePlugin } from './plugins/next-image.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const moduleRootReal = path.resolve(here, '..')

// React + react-dom must stay external so the SSR bundle uses the consumer's
// hoisted React and shares its internal dispatcher; bundling them detonates
// `useContext`. Other entries can be added per-project via `ssrExternal`.
const FORCED_SSR_EXTERNAL = [
  'next',
  'react',
  'react-dom',
  'react-dom/server',
] as const

interface ShellPaths {
  server: string
  client: string
  init: string
  router: string
  dynamic: string
}

const SHELL_PATHS: ShellPaths = {
  server: path.join(moduleRootReal, 'shell/app-shell.server.js'),
  client: path.join(moduleRootReal, 'shell/app-shell.client.js'),
  init: path.join(moduleRootReal, 'shell/init.client.js'),
  router: path.join(moduleRootReal, 'next-router-shim.js'),
  dynamic: path.join(moduleRootReal, 'next-dynamic-shim.js'),
}

export interface CreateConfigsOptions {
  entry: string
  dir?: string
  cacheSuffix?: string
  /** drop content hashes, disable minify, single-file SSR bundle */
  dev?: boolean
  importExcludeFromClient?: string[]
  cssExtendFolders?: string[]
  alias?: { find: string | RegExp; replacement: string }[]
  /** raw SCSS prepended to every Sass entry, merged with next.config's */
  additionalData?: string
  /** added to the SSR `external` list on top of react/react-dom/next */
  ssrExternal?: string[]
}

const createTildeImporter = (dir: string) => {
  const nodeModulesDirs: string[] = []
  let current = dir
  while (true) {
    nodeModulesDirs.push(path.join(current, 'node_modules'))
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  const fallbackCandidates = (target: string) => {
    const ext = path.extname(target)
    if (ext === '.scss' || ext === '.css' || ext === '.sass') return [target]
    const basename = path.basename(target)
    const dirname = path.dirname(target)
    return [
      `${target}.scss`,
      `${target}.sass`,
      `${target}.css`,
      path.join(dirname, `_${basename}.scss`),
      path.join(dirname, `_${basename}.sass`),
      path.join(dirname, `_${basename}.css`),
    ]
  }

  return {
    findFileUrl(url: string) {
      if (!url.startsWith('~')) return null
      const spec = url.slice(1)
      for (const nm of nodeModulesDirs) {
        const target = path.join(nm, spec)
        for (const candidate of fallbackCandidates(target)) {
          if (existsSync(candidate)) return pathToFileURL(candidate)
        }
      }
      return null
    },
  }
}

// Yarn / pnpm workspaces hoist most deps to the workspace root, so a file at
// `<workspace>/node_modules/<pkg>/...` won't match a project-local prefix.
const collectNodeModulesAncestors = (dir: string): string[] => {
  const dirs: string[] = []
  let current = dir
  while (true) {
    const nm = path.join(current, 'node_modules')
    if (existsSync(nm)) dirs.push(nm)
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return dirs
}

const createAdditionalData = (
  dir: string,
  cssExtendFolders: string[],
  prefix: string
) => {
  const nodeModulesAncestors = collectNodeModulesAncestors(dir)
  const resolvedExtendFolders = cssExtendFolders
    .map((folder) => path.resolve(dir, folder))
    .filter((folder) => existsSync(folder))

  return (source: string, filename: string) => {
    if (resolvedExtendFolders.length === 0) return `${prefix}\n${source}`

    const matchedAncestor = nodeModulesAncestors.find((nm) =>
      filename.startsWith(`${nm}${path.sep}`)
    )
    if (!matchedAncestor) return `${prefix}\n${source}`

    const relative = path.relative(matchedAncestor, filename)
    const relDir = path.dirname(relative)
    const fileBase = path.basename(relative, path.extname(relative))
    let suffix = ''
    for (const folder of resolvedExtendFolders) {
      const candidate = path.join(folder, relDir, `${fileBase}.scss`)
      if (existsSync(candidate)) {
        // Append (don't prepend) — extends reference vars defined by the
        // third-party file's own `@import`s, which run with `source`.
        suffix += `\n@import '${candidate.replace(/\\/g, '/')}';`
      }
    }
    return `${prefix}\n${source}${suffix}`
  }
}

const buildScssConfig = (
  dir: string,
  cssExtendFolders: string[],
  consumerSass: ConsumerSassOptions
) => ({
  loadPaths: consumerSass.loadPaths,
  additionalData: createAdditionalData(
    dir,
    cssExtendFolders,
    consumerSass.additionalData
  ),
  implementation: 'sass-embedded',
  api: 'modern-compiler' as const,
  importers: [createTildeImporter(dir)],
  silenceDeprecations: consumerSass.silenceDeprecations ?? [],
})

const sharedPlugins = (
  entry: string,
  shell: ShellPaths,
  excluded: string[],
  swcPlugins: [string, unknown][] | undefined
): PluginOption[] => [
  overrideAliasesPlugin({
    routerShim: shell.router,
    dynamicShim: shell.dynamic,
  }),
  reactSwc({ plugins: swcPlugins as [string, Record<string, unknown>][] }),
  // Image-file imports return `{ src, width, height, blurDataURL }` instead
  // of a bare URL string, matching `next/image`'s `StaticImageData` shape.
  nextImagePlugin(),
  mainEntryPlugin(entry),
  cssDefaultExportPlugin(),
  ...(excluded.length > 0 ? [importExcludePlugin(excluded)] : []),
]

const cacheDirFor = (dir: string, suffix?: string) =>
  path.join(dir, '.next-static', 'cache', suffix ? `vite-${suffix}` : 'vite')

const outputDir = (dir: string, sub: 'client' | 'server') =>
  path.join(dir, '.next-static', sub)

const cssConfigFor = (
  dir: string,
  cssExtendFolders: string[],
  consumerSass: ConsumerSassOptions
) => {
  const scss = buildScssConfig(dir, cssExtendFolders, consumerSass)
  return { preprocessorOptions: { scss, sass: scss } }
}

export interface CreatedConfigs {
  client: InlineConfig
  ssr: InlineConfig
  shell: ShellPaths
}

interface ConsumerSassOptions {
  additionalData: string
  loadPaths: string[]
  silenceDeprecations: string[] | undefined
}

interface ResolvedNextConfigBits {
  i18n?: unknown
  basePath?: unknown
  swcPlugins?: [string, unknown][]
  sassOptions?: {
    additionalData?: unknown
    loadPaths?: string[]
    silenceDeprecations?: string[]
  }
}

const loadNextConfigBits = async (
  dir: string
): Promise<ResolvedNextConfigBits> => {
  const candidates = [
    'next.config.mjs',
    'next.config.js',
    'next.config.cjs',
    'next.config.ts',
  ]
  for (const name of candidates) {
    const full = path.join(dir, name)
    if (!existsSync(full)) continue
    try {
      // @ts-ignore: dynamic import of arbitrary user file
      const mod = await import(pathToFileURL(full).href)
      const exported = mod.default ?? mod
      const resolved =
        typeof exported === 'function'
          ? await exported('phase-production-build')
          : exported
      return {
        i18n: resolved?.i18n,
        basePath: resolved?.basePath,
        swcPlugins: resolved?.experimental?.swcPlugins as
          | [string, unknown][]
          | undefined,
        sassOptions: resolved?.sassOptions,
      }
    } catch {
      return {}
    }
  }
  return {}
}

export const createConfigs = async ({
  entry,
  dir = process.cwd(),
  cacheSuffix,
  dev = false,
  importExcludeFromClient = [],
  cssExtendFolders = [],
  alias = [],
  additionalData = '',
  ssrExternal = [],
}: CreateConfigsOptions): Promise<CreatedConfigs> => {
  const shell = SHELL_PATHS

  const { i18n, basePath, swcPlugins, sassOptions } = await loadNextConfigBits(
    dir
  )
  const nextAdditional =
    typeof sassOptions?.additionalData === 'string'
      ? sassOptions.additionalData
      : ''
  const consumerSass: ConsumerSassOptions = {
    additionalData: nextAdditional + additionalData,
    loadPaths: sassOptions?.loadPaths ?? [],
    silenceDeprecations: sassOptions?.silenceDeprecations,
  }
  const css = cssConfigFor(dir, cssExtendFolders, consumerSass)

  const sharedDefine: Record<string, string> = {
    'process.env.__NEXT_STATIC_I18N': JSON.stringify(i18n ?? {}),
    'process.env.__NEXT_ROUTER_BASEPATH': JSON.stringify(basePath ?? ''),
  }
  // Dev React is client-only — its concurrent-renderer + Provider strictness
  // collides with our streaming Suspense tree on the SSR side.
  // Don't `define` `process.env.NODE_ENV` either: it can DCE state-bearing
  // branches inside bundled deps.
  const devReact = process.env.NEXT_STATIC_DEV_REACT === '1'
  const clientMode = devReact ? 'development' : 'production'
  const ssrMode = 'production'
  const clientDefine = { ...sharedDefine, global: 'globalThis' }
  const ssrDefine = sharedDefine

  // jsx: 'automatic' — rolldown/oxc parses TSX/JSX without going through SWC.
  const sharedTransform = {
    esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  } as unknown as Pick<InlineConfig, 'esbuild'>

  const resolveOpts: InlineConfig['resolve'] = {
    alias: [
      ...alias,
      // Strip the leading `~` from bare-package references in CSS / JS.
      { find: /^~([a-zA-Z@][^/]*)/, replacement: '$1' },
    ],
  }

  const client: InlineConfig = {
    root: dir,
    base: './',
    configFile: false,
    mode: clientMode,
    cacheDir: cacheDirFor(dir, cacheSuffix),
    plugins: sharedPlugins(entry, shell, importExcludeFromClient, swcPlugins),
    css,
    define: clientDefine,
    resolve: resolveOpts,
    ...sharedTransform,
    build: {
      outDir: outputDir(dir, 'client'),
      emptyOutDir: true,
      manifest: true,
      cssCodeSplit: true,
      // Inline sourcemaps in dev — rolldown's CSS pipeline doesn't reliably
      // emit external `.css.map` siblings, but inline ones work in DevTools.
      sourcemap: dev ? 'inline' : false,
      minify: dev ? false : undefined,
      rollupOptions: {
        input: { init: shell.init, shell: shell.client },
        output: {
          entryFileNames: dev ? 'assets/[name].js' : 'assets/[name].[hash].js',
          chunkFileNames: dev ? 'assets/[name].js' : 'assets/[name].[hash].js',
          assetFileNames: dev
            ? 'assets/[name].[ext]'
            : 'assets/[name].[hash].[ext]',
        },
      },
    },
  }

  const ssr: InlineConfig = {
    root: dir,
    base: './',
    configFile: false,
    mode: ssrMode,
    cacheDir: cacheDirFor(dir, cacheSuffix),
    plugins: [
      recordImportsPlugin({ shimId: shell.dynamic, root: dir }),
      ...sharedPlugins(entry, shell, [], swcPlugins),
    ],
    css,
    define: ssrDefine,
    resolve: resolveOpts,
    ...sharedTransform,
    build: {
      outDir: outputDir(dir, 'server'),
      emptyOutDir: true,
      ssr: true,
      sourcemap: false,
      minify: dev ? false : undefined,
      rollupOptions: {
        input: { 'node-main': shell.server },
        output: {
          format: 'es',
          entryFileNames: '[name].mjs',
          chunkFileNames: dev
            ? 'chunks/[name].mjs'
            : 'chunks/[name]-[hash].mjs',
          // Required for safe `?v=mtime` re-imports in dev: split chunks
          // would import back via `../node-main.mjs` (no query) and split
          // every Context singleton across instances.
          inlineDynamicImports: dev,
        },
      },
    },
    ssr: {
      noExternal: true,
      external: [...FORCED_SSR_EXTERNAL, ...ssrExternal],
    },
  }

  return { client, ssr, shell }
}

export { SHELL_PATHS }
