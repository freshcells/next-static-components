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
// dist/module/build → dist/module
const moduleRootReal = path.resolve(here, '..')

const BASE_ADDITIONAL_DATA = `@use 'sass:math'; @import 'defaultSettings.scss';`

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
  /** absolute path to the user's entrypoint file (the one aliased as @main) */
  entry: string
  /** project directory (defaults to process.cwd()) */
  dir?: string
  /** suffix for the vite cache directory; mirrors --cacheSuffix */
  cacheSuffix?: string
  /**
   * Dev mode: drops content hashes from output filenames so rebuilds
   * overwrite in place (no chunk sprawl, browser revalidates the same
   * URL), and disables minification for readable bundle inspection.
   * `process.env.NODE_ENV` is controlled separately via
   * `NEXT_STATIC_DEV_REACT=1`.
   */
  dev?: boolean
  /** specifiers to replace with an empty module on the client build */
  importExcludeFromClient?: string[]
  /**
   * Folders that mirror the layout of `node_modules` and supply extension
   * stylesheets. For each `.scss` in `node_modules`, if a matching file
   * exists under any of these folders, it is prepended via `@import`. Mirrors
   * the `webpack-css-import-inject-loader` chain configured in `@fcse/next-config`.
   */
  cssExtendFolders?: string[]
  /**
   * Custom aliases — `find` is the import specifier (or webpack-style
   * `~prefix`) and `replacement` is the absolute path or bare package name.
   * Used for `url()` references inside CSS like `url('~fonts/foo.woff2')`
   * or `url('~@images/x.svg')` that need resolving to project folders.
   */
  alias?: { find: string; replacement: string }[]
  /**
   * SCSS variable overrides — prepended to every Sass entry via
   * `additionalData`. The values are emitted as quoted strings (good for
   * paths). Useful for path variables in third-party SCSS that use
   * `!default`, e.g. `$icomoon-font-path` or `$flag-icon-css-path`.
   *
   * Example: `[{ name: '$icomoon-font-path', value: '~fonts/fcse/iconfont/fonts' }]`
   * generates `$icomoon-font-path: '~fonts/fcse/iconfont/fonts';`.
   */
  scssDefines?: { name: string; value: string }[]
}

/**
 * Sass importer for webpack-style `~package/path` imports. Walks up from
 * `dir` checking each `node_modules` (so hoisted dependencies in
 * Yarn/pnpm workspaces resolve correctly) and applies Sass's extension
 * fallback (`.scss`, `.css`, `_partial.scss`, …).
 */
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
          if (existsSync(candidate)) {
            return pathToFileURL(candidate)
          }
        }
      }
      return null
    },
  }
}

// Walk up from `dir` collecting every `node_modules` ancestor — yarn /
// pnpm workspaces hoist most deps to the workspace root, so a file from
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
  scssDefines: string
) => {
  const nodeModulesAncestors = collectNodeModulesAncestors(dir)
  const resolvedExtendFolders = cssExtendFolders
    .map((folder) => path.resolve(dir, folder))
    .filter((folder) => existsSync(folder))
  const prefix = BASE_ADDITIONAL_DATA + scssDefines

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
        // Append (don't prepend) the extend `@import` so it lands AFTER
        // the original third-party file has had a chance to load its own
        // variables/mixins via its own `@import`s. Prepending caused the
        // extend's overrides to reference vars that weren't defined yet
        // (matches `webpack-css-import-inject-loader` behavior).
        suffix += `\n@import '${candidate.replace(/\\/g, '/')}';`
      }
    }
    return `${prefix}\n${source}${suffix}`
  }
}

const buildScssConfig = (
  dir: string,
  cssExtendFolders: string[],
  scssDefines: string
) => ({
  loadPaths: [path.join(dir, 'src', 'styles')],
  additionalData: createAdditionalData(dir, cssExtendFolders, scssDefines),
  implementation: 'sass-embedded',
  api: 'modern-compiler' as const,
  importers: [createTildeImporter(dir)],
  silenceDeprecations: [
    'legacy-js-api',
    'color-functions',
    'import',
    'global-builtin',
    'duplicate-var-flags',
    'if-function',
  ],
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
  // @vitejs/plugin-react-swc handles JSX/TSX transform with React's
  // automatic JSX runtime and runs the user's `experimental.swcPlugins`
  // (FormatJS, transform-imports, …) through standard `@swc/core`.
  reactSwc({ plugins: swcPlugins as [string, Record<string, unknown>][] }),
  // Image-file imports (`import logo from './logo.svg'`) emit
  // `{ src, width, height, blurDataURL }` instead of a bare URL string,
  // matching the `StaticImageData` shape consumers and `next/image`
  // expect. Replaces what `vite-plugin-storybook-nextjs-image` did.
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
  scssDefines: string
) => {
  const scss = buildScssConfig(dir, cssExtendFolders, scssDefines)
  return {
    preprocessorOptions: {
      scss,
      sass: scss,
    },
  }
}

const DEFAULT_CSS_EXTEND_FOLDER = path.join('src', 'styles', 'extend')

export interface CreatedConfigs {
  client: InlineConfig
  ssr: InlineConfig
  shell: ShellPaths
}

interface ResolvedNextConfigBits {
  i18n?: unknown
  basePath?: unknown
  swcPlugins?: [string, unknown][]
}

/**
 * Best-effort load of `next.config.{js,mjs,cjs,ts}`'s `i18n`, `basePath`
 * and `experimental.swcPlugins` so we can inject them via Vite's `define`
 * (for the env vars) and feed `swcPlugins` to `@vitejs/plugin-react-swc`.
 *
 * Failures (no config, syntax error, etc.) are swallowed — the consumer can
 * still pass i18n/basePath per-request through `serve()` options.
 */
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
  scssDefines = [],
}: CreateConfigsOptions): Promise<CreatedConfigs> => {
  const shell = SHELL_PATHS

  const allExtendFolders = [
    path.join(dir, DEFAULT_CSS_EXTEND_FOLDER),
    ...cssExtendFolders,
  ]
  const scssDefinesPrefix = scssDefines
    .map(({ name, value }) => {
      const varName = name.startsWith('$') ? name : `$${name}`
      const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      return `${varName}: "${escaped}";`
    })
    .join('\n')
  const css = cssConfigFor(dir, allExtendFolders, scssDefinesPrefix)

  const { i18n, basePath, swcPlugins } = await loadNextConfigBits(dir)
  const sharedDefine: Record<string, string> = {
    'process.env.__NEXT_STATIC_I18N': JSON.stringify(i18n ?? {}),
    'process.env.__NEXT_ROUTER_BASEPATH': JSON.stringify(basePath ?? ''),
  }
  // Dev React (mode='development' on the client) gives the browser
  // unminified errors + dev assertions. SSR stays at production mode —
  // dev React's concurrent-renderer + Provider/Context strictness collides
  // with our streaming Suspense tree (previously hit "multiple renderers
  // concurrently rendering the same context provider" + null-context
  // destructuring). We deliberately do NOT `define` `process.env.NODE_ENV`
  // here: that compile-time substitution can DCE state-bearing branches
  // inside bundled deps like Geschichte (`useStore is not a function`).
  const devReact = process.env.NEXT_STATIC_DEV_REACT === '1'
  const clientMode = devReact ? 'development' : 'production'
  const ssrMode = 'production'
  // Client bundles ship to the browser, where Node's `global` isn't
  // available. Some deps (e.g. anything that polyfilled Node behavior)
  // reference `global`; alias it to `globalThis` at compile time.
  const clientDefine = {
    ...sharedDefine,
    global: 'globalThis',
  }
  const ssrDefine = sharedDefine

  // Vite's `esbuild` setting controls how rolldown/oxc parses JSX/TS. We need
  // `jsx: 'automatic'` so .tsx and .jsx files are parsed correctly without
  // running through SWC. Cast through unknown — the property name varies
  // across Vite versions and we want to avoid a hard type dependency.
  const sharedTransform = {
    esbuild: {
      jsx: 'automatic',
      jsxImportSource: 'react',
    },
  } as unknown as Pick<InlineConfig, 'esbuild'>

  // Resolve aliases for Vite's main resolver (used for both `import` and CSS
  // `url()` references):
  // 1. User-provided `alias` entries (project-specific tilde paths like
  //    `~fonts` → `<project>/src/fonts`).
  // 2. A catch-all regex stripping `~` from bare-package references — turns
  //    `url('~flag-icon-css/flags/...svg')` into `url('flag-icon-css/...')`
  //    so node_modules resolution finds the file. Webpack/sass-loader does
  //    the same thing implicitly.
  const resolveOpts: InlineConfig['resolve'] = {
    alias: [
      ...alias,
      {
        find: /^~([a-zA-Z@][^/]*)/,
        replacement: '$1',
      },
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
      // Inline sourcemaps in dev: embedded into each .js / .css file as a
      // `sourceMappingURL=data:...` comment. External `.css.map` siblings
      // are inconsistently produced by rolldown's CSS pipeline; inline
      // sourcemaps work reliably in DevTools and don't pollute the assets
      // directory with extra files.
      sourcemap: dev ? 'inline' : false,
      minify: dev ? false : undefined,
      rollupOptions: {
        input: {
          init: shell.init,
          shell: shell.client,
        },
        output: {
          entryFileNames: dev
            ? 'assets/[name].js'
            : 'assets/[name].[hash].js',
          chunkFileNames: dev
            ? 'assets/[name].js'
            : 'assets/[name].[hash].js',
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
          chunkFileNames: dev ? 'chunks/[name].mjs' : 'chunks/[name]-[hash].mjs',
          // In dev we re-import `node-main.mjs?v=mtime` on every rebuild
          // (see serve.ts). Vite's normal SSR chunk-splitting emits
          // `chunks/X.mjs` files that import back via `../node-main.mjs`
          // (no query) — so a `?v=` re-import would split into two
          // module-graph instances and detonate every Apollo / Geschichte
          // / React Context singleton. Inlining all chunks into a single
          // `node-main.mjs` removes those back-imports entirely; the dev
          // bundle is fatter to evaluate once but stays trivially safe to
          // hot-swap.
          inlineDynamicImports: dev,
        },
      },
    },
    ssr: {
      // Bundle everything by default so the SSR module is self-contained
      // and uses our shims (next/router, next/dynamic). Specific packages
      // that break under bundling (dynamic require()s, etc.) are listed in
      // `external` and resolved through Node's normal module resolution at
      // runtime (the bundle runs inside the consumer's process so its
      // node_modules tree is available).
      noExternal: true,
      external: [
        'next',
        // React/react-dom must stay external so the bundle uses the
        // consumer's hoisted React and react-dom share their internal
        // dispatcher. Bundling them here breaks `useContext` (null dispatcher).
        'react',
        'react-dom',
        'react-dom/server',
        // i18n-iso-countries uses runtime require('./langs/' + locale) which
        // rolldown can't statically resolve — must stay external.
        'i18n-iso-countries',
      ],
    },
  }

  return { client, ssr, shell }
}

export { SHELL_PATHS }
