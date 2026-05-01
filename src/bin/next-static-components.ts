#!/usr/bin/env node
import path from 'node:path'
import { parseArgs } from 'node:util'
import { build } from 'vite'
import { createConfigs } from '../build/vite-config.js'
import { loadStaticConfig } from '../build/config-file.js'

process.env.IS_NEXT_STATIC_BUILD = '1'

const argv = process.argv.slice(2)
const [first, ...rest] = argv
const isDev = first === 'dev'
const positionalArgs = isDev ? rest : argv

const { values } = parseArgs({
  args: positionalArgs,
  strict: true,
  allowPositionals: true,
  options: {
    cacheSuffix: { type: 'string' },
    dev: { type: 'boolean', default: false },
  },
})

if (values.dev || isDev) process.env.NEXT_STATIC_DEV_REACT = '1'

const cwd = process.cwd()
const config = await loadStaticConfig(cwd)
const entryArg = config.entry
if (!entryArg) {
  console.error(
    '[next-static] Missing `entry` — set it in next-static.config.mjs.'
  )
  process.exit(1)
}

const resolvePath = (p: string) =>
  p.startsWith('.') ? path.resolve(cwd, p) : p

const configs = await createConfigs({
  entry: path.resolve(cwd, entryArg),
  dir: cwd,
  cacheSuffix: values.cacheSuffix,
  dev: isDev,
  importExcludeFromClient: config.importExcludeFromClient,
  cssExtendFolders: config.cssExtendFolders,
  alias: (config.alias ?? []).map(({ find, replacement }) => ({
    find,
    replacement: resolvePath(replacement),
  })),
  additionalData: config.additionalData,
  ssrExternal: config.ssrExternal,
})

if (isDev) {
  console.log(
    'ℹ️  next-static-components watch mode (NODE_ENV=development, stable ' +
      'filenames, unminified). Rebuilds on file change — `yarn dev` picks ' +
      'them up automatically on the next request; just refresh the browser.'
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
