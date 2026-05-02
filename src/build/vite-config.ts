import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import type { InlineConfig, PluginOption } from 'vite'
import reactSwc from '@vitejs/plugin-react-swc'
import { importExcludePlugin } from './plugins/import-exclude.js'
import { cssDefaultExportPlugin } from './plugins/css-default-export.js'
import { recordImportsPlugin } from './plugins/record-imports.js'
import { nextImagePlugin } from './plugins/next-image.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const moduleRootReal = path.resolve(here, '..')

// React + react-dom must stay external so the SSR bundle uses the consumer's
// hoisted React and shares its internal dispatcher; bundling them detonates
// `useContext`. Other entries can be added per-project via `ssrExternal`.
const FORCED_SSR_EXTERNAL = ['next', 'react', 'react-dom', 'react-dom/server'] as const

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

const CONTEXT_CLIENT = path.join(moduleRootReal, 'context.js')
const CONTEXT_SERVER = path.join(moduleRootReal, 'context.server.js')

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

// Yarn / pnpm workspaces hoist most deps to the workspace root, so a file at
// `<workspace>/node_modules/<pkg>/...` won't match a project-local prefix —
// we need to consider every ancestor's `node_modules`.
const nodeModulesAncestors = (dir: string): string[] => {
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

const SCSS_FALLBACK_EXTS = ['.scss', '.sass', '.css'] as const

const tildeFallbackCandidates = (target: string): string[] => {
  if ((SCSS_FALLBACK_EXTS as readonly string[]).includes(path.extname(target))) return [target]
  const basename = path.basename(target)
  const dirname = path.dirname(target)
  return [
    ...SCSS_FALLBACK_EXTS.map((ext) => `${target}${ext}`),
    ...SCSS_FALLBACK_EXTS.map((ext) => path.join(dirname, `_${basename}${ext}`)),
  ]
}

const createTildeImporter = (dir: string) => {
  const dirs = nodeModulesAncestors(dir)
  return {
    findFileUrl(url: string) {
      if (!url.startsWith('~')) return null
      const spec = url.slice(1)
      for (const nm of dirs) {
        for (const candidate of tildeFallbackCandidates(path.join(nm, spec))) {
          if (existsSync(candidate)) return pathToFileURL(candidate)
        }
      }
      return null
    },
  }
}

const createAdditionalData = (dir: string, cssExtendFolders: string[], prefix: string) => {
  const ancestors = nodeModulesAncestors(dir)
  const resolvedExtendFolders = cssExtendFolders
    .map((folder) => path.resolve(dir, folder))
    .filter((folder) => existsSync(folder))

  return (source: string, filename: string) => {
    if (resolvedExtendFolders.length === 0) return `${prefix}\n${source}`

    const matchedAncestor = ancestors.find((nm) => filename.startsWith(`${nm}${path.sep}`))
    if (!matchedAncestor) return `${prefix}\n${source}`

    const relative = path.relative(matchedAncestor, filename)
    const relDir = path.dirname(relative)
    const fileBase = path.basename(relative, path.extname(relative))
    let suffix = ''
    for (const folder of resolvedExtendFolders) {
      const candidate = path.join(folder, relDir, `${fileBase}.scss`)
      if (existsSync(candidate)) {
        // Append (don't prepend) — extends reference vars defined by the
        // third-party file's own `@import`s, which only run with `source`.
        suffix += `\n@import '${candidate.replace(/\\/g, '/')}';`
      }
    }
    return `${prefix}\n${source}${suffix}`
  }
}

const buildScssConfig = (
  dir: string,
  cssExtendFolders: string[],
  consumerSass: ConsumerSassOptions,
) => ({
  loadPaths: consumerSass.loadPaths,
  additionalData: createAdditionalData(dir, cssExtendFolders, consumerSass.additionalData),
  implementation: 'sass-embedded',
  api: 'modern-compiler' as const,
  importers: [createTildeImporter(dir)],
  silenceDeprecations: consumerSass.silenceDeprecations ?? [],
})

// SSR-only swap of our platform-neutral `context.js` for the
// `createRequire`-based `context.server.js`. Done via `resolveId` so it
// works for the relative imports (`../context.js`,
// `../../context.js`, …) emitted by the shell, which a string-prefix
// alias couldn't catch.
const contextSwapPlugin = ({ from, to }: { from: string; to: string }): PluginOption => ({
  name: 'next-static:context-swap',
  enforce: 'pre',
  async resolveId(id, importer) {
    if (!importer || !id.endsWith('/context.js')) return null
    const resolved = path.resolve(path.dirname(importer), id)
    return resolved === from ? to : null
  },
})

const sharedPlugins = (
  excluded: string[],
  swcPlugins: [string, unknown][] | undefined,
): PluginOption[] => [
  reactSwc({ plugins: swcPlugins as [string, Record<string, unknown>][] }),
  // Image-file imports return `{ src, width, height, blurDataURL }` instead
  // of a bare URL string, matching `next/image`'s `StaticImageData` shape.
  nextImagePlugin(),
  cssDefaultExportPlugin(),
  ...(excluded.length > 0 ? [importExcludePlugin(excluded)] : []),
]

const cacheDirFor = (dir: string, suffix?: string) =>
  path.join(dir, '.next-static', 'cache', suffix ? `vite-${suffix}` : 'vite')

const outputDir = (dir: string, sub: 'client' | 'server') => path.join(dir, '.next-static', sub)

const cssConfigFor = (
  dir: string,
  cssExtendFolders: string[],
  consumerSass: ConsumerSassOptions,
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
    additionalData?: string
    loadPaths?: string[]
    silenceDeprecations?: string[]
  }
}

const loadNextConfigBits = async (dir: string): Promise<ResolvedNextConfigBits> => {
  const candidates = ['next.config.mjs', 'next.config.js', 'next.config.cjs', 'next.config.ts']
  for (const name of candidates) {
    const full = path.join(dir, name)
    if (!existsSync(full)) continue
    try {
      const mod = await import(pathToFileURL(full).href)
      const exported = mod.default ?? mod
      const resolved =
        typeof exported === 'function' ? await exported('phase-production-build') : exported
      return {
        i18n: resolved?.i18n,
        basePath: resolved?.basePath,
        swcPlugins: resolved?.experimental?.swcPlugins as [string, unknown][] | undefined,
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

  const { i18n, basePath, swcPlugins, sassOptions } = await loadNextConfigBits(dir)
  const consumerSass: ConsumerSassOptions = {
    additionalData: (sassOptions?.additionalData ?? '') + additionalData,
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

  const resolveOpts: InlineConfig['resolve'] = {
    tsconfigPaths: true,
    alias: [
      // The user's entrypoint, exposed as `import application from '@main'`
      // inside the shell.
      { find: '@main', replacement: entry },
      // Replace `next/router` and `next/dynamic` with our context-backed
      // shims. Exact-match (regex anchored end-to-end) so deeper subpaths
      // are not accidentally remapped.
      { find: /^next\/router$/, replacement: shell.router },
      { find: /^next\/dynamic$/, replacement: shell.dynamic },
      ...alias.map(({ find, replacement }) => ({
        find,
        // `path.resolve` is a no-op for absolute / bare-package strings,
        // and resolves `./foo` against `dir` for the relative case.
        replacement:
          typeof replacement === 'string' && replacement.startsWith('.')
            ? path.resolve(dir, replacement)
            : replacement,
      })),
      // Strip the leading `~` from bare-package references (webpack legacy).
      { find: /^~([a-zA-Z@][^/]*)/, replacement: '$1' },
    ],
  }

  const client: InlineConfig = {
    root: dir,
    base: './',
    configFile: false,
    mode: clientMode,
    cacheDir: cacheDirFor(dir, cacheSuffix),
    plugins: sharedPlugins(importExcludeFromClient, swcPlugins),
    css,
    define: clientDefine,
    resolve: resolveOpts,
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
          assetFileNames: dev ? 'assets/[name].[ext]' : 'assets/[name].[hash].[ext]',
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
      contextSwapPlugin({ from: CONTEXT_CLIENT, to: CONTEXT_SERVER }),
      ...sharedPlugins([], swcPlugins),
    ],
    css,
    define: ssrDefine,
    resolve: resolveOpts,
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
          chunkFileNames: dev ? 'chunks/[name].mjs' : 'chunks/[name]-[hash].mjs',
          // Required for safe `?v=mtime` re-imports in dev: split chunks
          // would import back via `../node-main.mjs` (no query) and split
          // every Context singleton across instances.
          codeSplitting: !dev,
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
