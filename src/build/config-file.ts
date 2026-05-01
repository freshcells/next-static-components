import path from 'node:path'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export interface AliasEntry {
  find: string | RegExp
  replacement: string
}

export interface NextStaticConfig {
  /** path to the `@main` entrypoint, relative to project root */
  entry?: string
  /** specifiers replaced with empty modules in the client build */
  importExcludeFromClient?: string[]
  /** folders that mirror `node_modules`; matching `.scss` paths are appended via `@import` */
  cssExtendFolders?: string[]
  /** extra import + CSS `url()` aliases */
  alias?: AliasEntry[]
  /** raw SCSS prepended to every Sass entry, merged with `next.config.sassOptions.additionalData` */
  additionalData?: string
  /** packages added to the SSR `external` list (loaded via Node resolution at runtime) */
  ssrExternal?: string[]
}

export const defineConfig = (config: NextStaticConfig): NextStaticConfig => config

const CONFIG_FILENAMES = ['next-static.config.mjs', 'next-static.config.js']

export const loadStaticConfig = async (dir: string): Promise<NextStaticConfig> => {
  for (const name of CONFIG_FILENAMES) {
    const full = path.join(dir, name)
    if (!existsSync(full)) continue
    const mod = await import(pathToFileURL(full).href)
    return (mod.default ?? mod) as NextStaticConfig
  }
  return {}
}
