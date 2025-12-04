#!/usr/bin/env node
import config from '../webpack/webpack.config.js'
import { parseArgs } from 'node:util'

// we have to use the next rspack export, as it registers a native plugin
import rspackImport from '@next/rspack-core'

// types are wrong
const rspack = rspackImport.default || rspackImport

const [entry, ...restArgs] = process.argv.slice(2)
console.log('ℹ️ Building static bundle.')
process.env.NEXT_PRIVATE_LOCAL_WEBPACK = '1'
process.env.IS_NEXT_STATIC_BUILD = '1'
process.env.NEXT_RSPACK = 'true'

const { values } = parseArgs({
  restArgs,
  strict: true,
  allowPositionals: true,
  options: {
    cacheSuffix: { type: 'string' },
    importExcludeFromClient: { type: 'string', multiple: true },
  },
})

const configs = await config({
  entry,
  cacheSuffix: values.cacheSuffix,
  clientAliases: Object.fromEntries(
    values.importExcludeFromClient?.map?.((alias) => [alias, false]) || []
  ),
})

rspack(configs, (err, stats) => {
  if (err) {
    console.error(err.stack || err)
    if (err.cause) {
      console.error(err.cause)
    }
    process.exit(1)
  }
  process.stdout.write(stats + '\n')
})
