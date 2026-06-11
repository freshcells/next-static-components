import path from 'node:path'
import type { Plugin } from 'vite'

// matches `dynamic(() => import('X'))` incl. async/whitespace/options variants;
// kept as a source string — a shared /g RegExp races `lastIndex` across transforms
const CALL_RE_SRC =
  '\\bdynamic\\s*\\(\\s*(?:async\\s*)?\\(\\s*\\)\\s*=>\\s*import\\s*\\(\\s*([\'"`])([^\'"`]+)\\1\\s*\\)'

export interface RecordImportsOptions {
  /** absolute path to `next-dynamic-shim.js`, source of `__nscDynamic` */
  shimId: string
  /** project build root — used to compute manifest-key paths */
  root: string
}

/**
 * SSR-only transform rewriting `dynamic(() => import('./X'))` to
 * `__nscDynamic('<manifest key>', () => import('./X'))` so the shell can
 * emit preloads only for chunks that actually rendered.
 */
export const recordImportsPlugin = ({ shimId, root }: RecordImportsOptions): Plugin => {
  const helperLocal = '__nscDynamic'
  return {
    name: 'next-static-record-imports',
    enforce: 'pre',
    apply: 'build',
    applyToEnvironment(env) {
      return env.name === 'ssr'
    },
    async transform(code, id) {
      if (id.includes('\0')) return
      if (id.includes('node_modules')) return
      if (id === shimId) return
      if (!/\.[cm]?[jt]sx?(\?|$)/.test(id)) return
      if (!/\bdynamic\s*\(/.test(code)) return

      const re = new RegExp(CALL_RE_SRC, 'g')
      const edits: { start: number; end: number; replacement: string }[] = []

      for (const match of code.matchAll(re)) {
        const spec = match[2]
        const matchIndex = match.index ?? 0
        const matchEnd = matchIndex + match[0].length

        // keep the loader's exact source text when reconstructing the call
        const loaderRelStart = match[0].search(/\(\s*\)\s*=>/)
        if (loaderRelStart < 0) continue
        const loaderStart = matchIndex + loaderRelStart
        const loaderText = code.slice(loaderStart, matchEnd)

        const resolved = await this.resolve(spec, id)
        if (!resolved || resolved.external) continue
        const moduleKey = path.relative(root, resolved.id.split('?')[0]).replace(/\\/g, '/')
        if (!moduleKey || moduleKey.startsWith('..\\')) continue

        edits.push({
          start: matchIndex,
          end: matchEnd,
          replacement: `${helperLocal}(${JSON.stringify(moduleKey)}, ${loaderText}`,
        })
      }

      if (edits.length === 0) return

      let out = ''
      let cursor = 0
      for (const edit of edits) {
        out += code.slice(cursor, edit.start) + edit.replacement
        cursor = edit.end
      }
      out += code.slice(cursor)

      const importStmt = `import { __nscDynamic as ${helperLocal} } from ${JSON.stringify(shimId)};\n`
      return { code: importStmt + out, map: null }
    },
  }
}
