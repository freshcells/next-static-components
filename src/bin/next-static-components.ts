#!/usr/bin/env node
import path from 'node:path'
import { parseArgs } from 'node:util'
import { build } from 'vite'
import { createConfigs } from '../build/vite-config.js'

process.env.IS_NEXT_STATIC_BUILD = '1'

const argv = process.argv.slice(2)
const [first, ...rest] = argv
const isDev = first === 'dev'
const positionalArgs = isDev ? rest : argv

const { values, positionals } = parseArgs({
  args: positionalArgs,
  strict: true,
  allowPositionals: true,
  options: {
    cacheSuffix: { type: 'string' },
    importExcludeFromClient: { type: 'string', multiple: true },
    cssExtendFolder: { type: 'string', multiple: true },
    /**
     * `--alias <find>=<replacement>` (repeatable). Resolves webpack-style
     * `~find/...` references in JS imports AND CSS `url()` references.
     * Example: `--alias '~fonts=./src/fonts' --alias '~@images=./src/images'`.
     */
    alias: { type: 'string', multiple: true },
    /**
     * `--scssDefine '<varname>=<value>'` (repeatable). Prepends a SCSS
     * variable assignment to every Sass entry's `additionalData`. The
     * value is emitted as a single-quoted string. Useful for overriding
     * `!default` path variables in third-party SCSS.
     * Example: `--scssDefine '$icomoon-font-path=~fonts/fcse/iconfont/fonts'`.
     */
    scssDefine: { type: 'string', multiple: true },
    dev: { type: 'boolean', default: false },
  },
})

const entryArg = positionals[0]
if (!entryArg) {
  console.error(
    '[next-static] Missing required positional argument: <entrypoint>'
  )
  process.exit(1)
}

const cwd = process.cwd()
const entry = path.resolve(cwd, entryArg)

// `--dev` opts into development React (unminified errors in the browser).
// Note: the `dev` subcommand (watch mode) intentionally does NOT enable this
// — dev React + streaming SSR + Suspense has SSR-side issues with this app's
// Provider/Context tree, and watch mode mainly needs fast iteration, not
// unminified errors.
if (values.dev) process.env.NEXT_STATIC_DEV_REACT = '1'

const parseKeyValue = (
  flag: string,
  expected: string,
  raw: string
): [string, string] => {
  const eq = raw.indexOf('=')
  if (eq === -1) {
    console.error(`[next-static] Invalid ${flag} "${raw}". Expected ${expected}.`)
    process.exit(1)
  }
  return [raw.slice(0, eq), raw.slice(eq + 1)]
}

const parsedAliases = (values.alias || []).map((entry) => {
  const [find, replacementRaw] = parseKeyValue(
    '--alias',
    '"<find>=<replacement>"',
    entry
  )
  // Resolve relative replacements against cwd so users can write
  // `--alias '~fonts=./src/fonts'`.
  const replacement = replacementRaw.startsWith('.')
    ? path.resolve(cwd, replacementRaw)
    : replacementRaw
  return { find, replacement }
})

const parsedScssDefines = (values.scssDefine || []).map((entry) => {
  const [name, value] = parseKeyValue(
    '--scssDefine',
    '"<varname>=<value>"',
    entry
  )
  return { name, value }
})

const sharedOptions = {
  entry,
  dir: cwd,
  cacheSuffix: values.cacheSuffix,
  importExcludeFromClient: values.importExcludeFromClient || [],
  cssExtendFolders: values.cssExtendFolder || [],
  alias: parsedAliases,
  scssDefines: parsedScssDefines,
}

const configs = await createConfigs(sharedOptions)

if (isDev) {
  console.log(
    'ℹ️  next-static-components watch mode. Rebuilds on file change — keep ' +
      "this running and `yarn dev` in another terminal; refresh the browser " +
      'to see updates.'
  )
  const withWatch = (cfg: typeof configs.client) => ({
    ...cfg,
    build: { ...cfg.build, watch: {} },
  })
  await Promise.all([
    build(withWatch(configs.client)),
    build(withWatch(configs.ssr)),
  ])
} else {
  console.log('ℹ️  Building next-static-components static bundle.')
  await Promise.all([build(configs.client), build(configs.ssr)])
  console.log('✅ Build complete.')
}

// (Note: the dev branch above replaces what was previously a Vite dev
// middleware-mode server. That approach broke on the consumer's CJS-heavy
// dep tree — Vite's dev SSR module runner needs CJS-interop config per
// affected package. Watch-mode rebuilds + mtime-based module cache
// invalidation in `serve.ts` give the same iterative experience without
// the interop landmines.)
