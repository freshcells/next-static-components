import type { Plugin } from 'vite'

const MAIN_ALIAS = '@main'

export const mainEntryPlugin = (entryAbsPath: string): Plugin => ({
  name: 'next-static:main-entry',
  enforce: 'pre',
  resolveId(id) {
    if (id === MAIN_ALIAS) return entryAbsPath
    return null
  },
})
