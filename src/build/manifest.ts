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

const baseFor = (publicPath: string) => publicPath.replace(/\/$/, '')

const buildByFile = (manifest: ViteManifest) => {
  const byFile = new Map<string, ManifestEntry>()
  for (const entry of Object.values(manifest)) byFile.set(entry.file, entry)
  return byFile
}

interface WalkContext {
  manifest: ViteManifest
  byFile: Map<string, ManifestEntry>
  visited: Set<string>
  seenStyles: Set<string>
  modulePreloads: string[]
  stylesheets: string[]
  withBase: (file: string) => string
}

// Walk only static `imports` — those are guaranteed to load with the chunk.
// Dynamic imports are handled separately via the per-render rendered-module
// set, so we don't preload chunks the SSR pass never streamed.
const walkStatic = (file: string, ctx: WalkContext, asPreload: boolean) => {
  if (ctx.visited.has(file)) return
  ctx.visited.add(file)
  const entry = ctx.byFile.get(file)
  if (!entry) return

  if (asPreload) ctx.modulePreloads.push(ctx.withBase(entry.file))

  for (const css of entry.css || []) {
    if (ctx.seenStyles.has(css)) continue
    ctx.seenStyles.add(css)
    ctx.stylesheets.push(ctx.withBase(css))
  }

  for (const imp of entry.imports || []) {
    const importedEntry = ctx.manifest[imp]
    if (importedEntry) walkStatic(importedEntry.file, ctx, true)
  }
}

export interface StaticAssets extends CollectedAssets {
  /** snapshot of internal walker state so per-request walks can extend it */
  visited: Set<string>
  seenStyles: Set<string>
}

export const collectStaticAssets = (
  manifest: ViteManifest,
  entryNames: string[],
  publicPath: string
): StaticAssets => {
  const byName = new Map<string, ManifestEntry>()
  for (const entry of Object.values(manifest)) {
    if (entry.isEntry && entry.name) byName.set(entry.name, entry)
  }

  const ctx: WalkContext = {
    manifest,
    byFile: buildByFile(manifest),
    visited: new Set<string>(),
    seenStyles: new Set<string>(),
    modulePreloads: [],
    stylesheets: [],
    withBase: (file: string) => `${baseFor(publicPath)}/${file}`,
  }
  const entryScripts: string[] = []

  for (const name of entryNames) {
    const entry = byName.get(name)
    if (!entry) continue
    if (ctx.visited.has(entry.file)) continue
    ctx.visited.add(entry.file)
    entryScripts.push(ctx.withBase(entry.file))

    for (const css of entry.css || []) {
      if (ctx.seenStyles.has(css)) continue
      ctx.seenStyles.add(css)
      ctx.stylesheets.push(ctx.withBase(css))
    }
    for (const imp of entry.imports || []) {
      const importedEntry = manifest[imp]
      if (importedEntry) walkStatic(importedEntry.file, ctx, true)
    }
  }

  return {
    entryScripts,
    modulePreloads: ctx.modulePreloads,
    stylesheets: ctx.stylesheets,
    visited: ctx.visited,
    seenStyles: ctx.seenStyles,
  }
}

/**
 * Extend the static asset set with chunks for modules whose dynamic-import
 * loader actually fired during this SSR pass (recorded via the
 * `record-imports` plugin + `recordModuleId` runtime). Walks each rendered
 * module's static-import subgraph so its dependencies get preload hints
 * too — but does NOT chase further `dynamicImports`, since those represent
 * boundaries that didn't render and shouldn't ship up-front.
 */
export const collectRenderedAssets = (
  manifest: ViteManifest,
  renderedModuleIds: Iterable<string>,
  publicPath: string,
  staticAssets: StaticAssets
): { modulePreloads: string[]; stylesheets: string[] } => {
  const ctx: WalkContext = {
    manifest,
    byFile: buildByFile(manifest),
    visited: new Set<string>(staticAssets.visited),
    seenStyles: new Set<string>(staticAssets.seenStyles),
    modulePreloads: [],
    stylesheets: [],
    withBase: (file: string) => `${baseFor(publicPath)}/${file}`,
  }

  for (const id of renderedModuleIds) {
    const entry = manifest[id]
    if (!entry) continue
    walkStatic(entry.file, ctx, true)
  }

  return { modulePreloads: ctx.modulePreloads, stylesheets: ctx.stylesheets }
}
