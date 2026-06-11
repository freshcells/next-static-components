import path from 'node:path'
import fs from 'node:fs'
import type { Plugin } from 'vite'

const SKIPPED_TOP_LEVEL_DIRS = new Set(['styles', 'translations'])

const SKIPPED_QUERY_RE = /[?&](?:url|raw)\b/

export const collectWhitelabelOverrides = (themeAbs: string): string[] => {
  if (!fs.existsSync(themeAbs)) return []
  const entries = fs.readdirSync(themeAbs, { recursive: true, withFileTypes: true })
  const result: string[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const rel = path.relative(themeAbs, path.join(entry.parentPath, entry.name))
    if (SKIPPED_TOP_LEVEL_DIRS.has(rel.split(path.sep)[0])) continue
    result.push(rel)
  }
  return result
}

export interface WhitelabelOverrideOptions {
  mainSrcAbs: string
  themeAbs: string
  overrides: string[]
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const whitelabelOverridePlugin = ({
  mainSrcAbs,
  themeAbs,
  overrides,
}: WhitelabelOverrideOptions): Plugin => {
  const overrideSet = new Set(overrides)
  const srcPrefix = `${mainSrcAbs.replace(/\\/g, '/')}/`
  const themePrefix = `${themeAbs.replace(/\\/g, '/')}/`
  const filterRe = new RegExp(
    `^${escapeRe(srcPrefix)}.*\\.(?:tsx?|jsx?|mjs|cjs|json|scss|sass|css)(?:[?#]|$)`,
  )

  return {
    name: 'next-static:whitelabel-override',
    enforce: 'pre',
    load: {
      filter: { id: filterRe },
      handler(id) {
        if (id.includes('\0') || SKIPPED_QUERY_RE.test(id)) return null
        const file = id.split('?')[0]
        if (file.startsWith(themePrefix)) return null
        const rel = path.relative(mainSrcAbs, path.normalize(file))
        if (!overrideSet.has(rel)) return null
        const overridePath = path.join(themeAbs, rel)
        this.addWatchFile(overridePath)
        return fs.readFileSync(overridePath, 'utf8')
      },
    },
  }
}
