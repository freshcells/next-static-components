import path from 'node:path'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import type { CSSOptions } from 'vite'

export interface AliasEntry {
  find: string | RegExp
  replacement: string
}

/** inline PostCSS options + plugins, forwarded verbatim to Vite's `css.postcss` */
export type PostcssConfig = Exclude<CSSOptions['postcss'], string | undefined>

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
  /** inline PostCSS config (plugins etc.); unset keeps Vite's `postcss.config.*` auto-discovery */
  postcssConfig?: PostcssConfig
  /** packages added to the SSR `external` list (loaded via Node resolution at runtime) */
  ssrExternal?: string[]
  /** base folder containing whitelabel themes, relative to project root (default: 'src/whitelabels') */
  whitelabelBaseFolder?: string
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
