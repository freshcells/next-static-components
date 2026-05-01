import path from 'node:path'
import type { Plugin } from 'vite'

const VIRTUAL_PREFIX = '\0empty-module:'
const EMPTY_MODULE_SOURCE = 'export default {};\n'

export const importExcludePlugin = (excluded: string[]): Plugin => {
  const excludedAbsolute = excluded
    .filter((e) => e.startsWith('.') || path.isAbsolute(e))
    .map((e) => path.resolve(e))
  const excludedBare = excluded.filter((e) => !e.startsWith('.') && !path.isAbsolute(e))

  const isExcluded = (id: string, importer?: string) => {
    if (excludedBare.includes(id)) return true
    if (id.startsWith('.') && importer) {
      const resolved = path.resolve(path.dirname(importer), id)
      return excludedAbsolute.some((abs) => resolved === abs || resolved.startsWith(`${abs}.`))
    }
    if (path.isAbsolute(id)) {
      return excludedAbsolute.some((abs) => id === abs || id.startsWith(`${abs}.`))
    }
    return false
  }

  return {
    name: 'next-static:import-exclude',
    enforce: 'pre',
    resolveId(id, importer) {
      if (excluded.length === 0) return null
      if (isExcluded(id, importer)) {
        return `${VIRTUAL_PREFIX}${id}`
      }
      return null
    },
    load(id) {
      if (id.startsWith(VIRTUAL_PREFIX)) return EMPTY_MODULE_SOURCE
      return null
    },
  }
}
