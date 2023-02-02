#!/usr/bin/env node
import { ERROR_NO_RESOLVE, resolveEntry } from '../utils.js'

const webpackCliCommand = await resolveEntry('webpack/bin/webpack.js')
const webpackConfigPath = await resolveEntry(
  '../webpack/webpack.config.js',
  import.meta.url
)
import { spawn } from 'node:child_process'

if (!webpackCliCommand || !webpackConfigPath) {
  throw new Error(ERROR_NO_RESOLVE)
}

const [entry, ...restArgs] = process.argv.slice(2)

console.log('ℹ️ Building static bundle.')

const command = spawn(
  webpackCliCommand,
  ['--config', webpackConfigPath, '--env', `entry=${entry}`, ...restArgs],
  {
    stdio: 'inherit',
    env: {
      NEXT_PRIVATE_LOCAL_WEBPACK: '1',
      IS_NEXT_STATIC_BUILD: '1',
      ...process.env,
    },
  }
)

command.on('close', (code) => {
  if (code && code > 0) {
    console.error('⚠️ Build failed')
  } else {
    console.log('🎉 Build successful', code)
  }
  if (code !== null) {
    process.exitCode = code
  }
})

command.on('error', (e) => {
  console.error(`⚠️ Build failed: ${e.message}`)
  process.exitCode = 1
})
