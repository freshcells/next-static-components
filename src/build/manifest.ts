import fs from 'node:fs'

interface ManifestEntry {
  file: string
  name?: string
  src?: string
  isEntry?: boolean
  isDynamicEntry?: boolean
  imports?: string[]
  dynamicImports?: string[]
  css?: string[]
  assets?: string[]
}

export type ViteManifest = Record<string, ManifestEntry>

export interface CollectedAssets {
  entryScripts: string[]
  modulePreloads: string[]
  stylesheets: string[]
}

export const readManifest = (manifestPath: string): ViteManifest =>
  JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

export const collectAssets = (
  manifest: ViteManifest,
  entryNames: string[],
  publicPath: string
): CollectedAssets => {
  const byName = new Map<string, ManifestEntry>()
  const byFile = new Map<string, ManifestEntry>()
  for (const entry of Object.values(manifest)) {
    if (entry.isEntry && entry.name) byName.set(entry.name, entry)
    byFile.set(entry.file, entry)
  }

  const visited = new Set<string>()
  const entryScripts: string[] = []
  const modulePreloads: string[] = []
  const stylesheets: string[] = []
  const seenStyles = new Set<string>()

  const base = publicPath.replace(/\/$/, '')
  const withBase = (file: string) => `${base}/${file}`

  const walkChunk = (file: string, isEntry: boolean) => {
    if (visited.has(file)) return
    visited.add(file)

    const entry = byFile.get(file)
    if (!entry) return

    if (isEntry) entryScripts.push(withBase(entry.file))
    else modulePreloads.push(withBase(entry.file))

    for (const css of entry.css || []) {
      if (seenStyles.has(css)) continue
      seenStyles.add(css)
      stylesheets.push(withBase(css))
    }

    for (const imp of entry.imports || []) {
      const importedEntry = manifest[imp]
      if (importedEntry) walkChunk(importedEntry.file, false)
    }
  }

  for (const name of entryNames) {
    const entry = byName.get(name)
    if (!entry) continue
    walkChunk(entry.file, true)
    for (const imp of entry.imports || []) {
      const importedEntry = manifest[imp]
      if (importedEntry) walkChunk(importedEntry.file, false)
    }
  }

  return { entryScripts, modulePreloads, stylesheets }
}
