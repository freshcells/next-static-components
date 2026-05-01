import type { Plugin } from 'vite'

const CSS_EXTENSIONS = /\.(css|scss)(\?|$)/
const CSS_MODULE = /\.module\.(css|scss)(\?|$)/

/**
 * Webpack with sass-loader emits a default export of `{}` for plain
 * (non-module) stylesheet imports. Vite emits no default export for those —
 * a stylesheet `import styles from 'styles/base.scss'` becomes a build-time
 * MISSING_EXPORT error.
 *
 * This plugin runs after Vite's CSS plugin and appends `export default {}`
 * to the transformed JS module of any plain stylesheet import, restoring the
 * webpack-compatible shape without requiring callers to switch to side-effect
 * imports.
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
