#!/usr/bin/env node
import spawn from 'cross-spawn'
import { ERROR_NO_RESOLVE, resolveEntry } from '../utils.js'

// tell nextJS to use the local webpack package
process.env.NEXT_PRIVATE_LOCAL_WEBPACK = '1'
process.env.IS_NEXT_STATIC_BUILD = 'true'

const webpackCliCommand = await resolveEntry('webpack/bin/webpack.js')
const webpackConfigPath = await resolveEntry(
  '../webpack/webpack.config.js',
  import.meta.url
)

if (!webpackCliCommand || !webpackConfigPath) {
  throw new Error(ERROR_NO_RESOLVE)
}

const [entry, ...restArgs] = process.argv.slice(2)

try {
  const result = await spawn(
    webpackCliCommand,
    [
      '--config',
      webpackConfigPath,
      '--env',
      `entry=${entry}`,
      '--progress',
      ...restArgs,
    ],
    { stdio: 'inherit' }
  )
  if (result.exitCode !== null) {
    process.exitCode = result.exitCode
  }
} catch (e) {
  console.error(e)
  process.exitCode = 1
  throw e
}
