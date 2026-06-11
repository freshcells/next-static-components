import type { Plugin } from 'vite'

const CSS_EXTENSIONS = /\.(css|scss)(\?|$)/
const CSS_MODULE = /\.module\.(css|scss)(\?|$)/

/**
 * Appends `export default {}` to plain stylesheet imports — webpack-compatible
 * shape; Vite alone makes them a MISSING_EXPORT build error.
 */
export const cssDefaultExportPlugin = (): Plugin => ({
  name: 'next-static:css-default-export',
  enforce: 'post',
  transform(code, id) {
    if (!CSS_EXTENSIONS.test(id)) return null
    if (CSS_MODULE.test(id)) return null
    if (id.includes('?inline') || id.includes('?url') || id.includes('?raw')) {
      return null
    }
    if (code.includes('export default')) return null
    return {
      code: `${code}\nexport default {};\n`,
      map: null,
    }
  },
})
