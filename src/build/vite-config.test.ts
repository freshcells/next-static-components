import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { normalizePath } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAdditionalData } from './vite-config.js'

let root: string
let project: string
let extend: string

const touch = (file: string) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, '')
}
const run = (filename: string, dir = project) =>
  createAdditionalData(dir, ['extend'], '$p: 1;')('.a {}', filename)
const imported = (rel: string) => `@import '${normalizePath(path.join(extend, rel))}';`

beforeAll(() => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'nsc-extend-')))
  project = path.join(root, 'repo', 'apps', 'web')
  extend = path.join(project, 'extend')
  mkdirSync(path.join(project, 'node_modules'), { recursive: true })
  mkdirSync(path.join(root, 'repo', 'node_modules'), { recursive: true })
  touch(path.join(extend, 'pkg', 'styles', 'x.scss'))
  touch(path.join(extend, 'b', 'styles.scss'))
  touch(path.join(extend, 'legacy', 'node_modules', 'b', 'styles.scss'))
  touch(path.join(extend, '.pnpm', 'old@1.0.0', 'node_modules', 'old', 'x.scss'))
  touch(path.join(extend, 'old', 'x.scss'))
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('createAdditionalData', () => {
  it('matches flat and hoisted node_modules', () => {
    expect(run(path.join(project, 'node_modules/pkg/styles/x.scss'))).toBe(
      `$p: 1;\n.a {}\n${imported('pkg/styles/x.scss')}`,
    )
    expect(run(path.join(root, 'repo/node_modules/pkg/styles/x.scss'))).toContain(
      imported('pkg/styles/x.scss'),
    )
  })

  it('matches the pnpm virtual store', () => {
    expect(
      run(path.join(root, 'repo/node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/styles/x.scss')),
    ).toContain(imported('pkg/styles/x.scss'))
  })

  it('keeps extends that mirror the virtual store path', () => {
    const out = run(path.join(project, 'node_modules/.pnpm/old@1.0.0/node_modules/old/x.scss'))
    expect(out).toContain(imported('.pnpm/old@1.0.0/node_modules/old/x.scss'))
    expect(out).toContain(imported('old/x.scss'))
  })

  it('matches a virtual store outside the project', () => {
    expect(
      run(path.join(root, 'store/v10/links/pkg/1.0.0/abc/node_modules/pkg/styles/x.scss')),
    ).toContain(imported('pkg/styles/x.scss'))
  })

  it('does not apply a hoisted extend to a nested copy', () => {
    expect(run(path.join(project, 'node_modules/a/node_modules/b/styles.scss'))).toBe(
      '$p: 1;\n.a {}',
    )
    expect(run(path.join(project, 'node_modules/legacy/node_modules/b/styles.scss'))).toBe(
      `$p: 1;\n.a {}\n${imported('legacy/node_modules/b/styles.scss')}`,
    )
  })

  it('matches when the project dir is a symlink', () => {
    const link = path.join(root, 'link')
    symlinkSync(project, link, 'dir')
    expect(run(path.join(project, 'node_modules/pkg/styles/x.scss'), link)).toContain(
      `@import '${normalizePath(path.join(link, 'extend/pkg/styles/x.scss'))}';`,
    )
  })

  it('leaves project sources alone', () => {
    expect(run(path.join(project, 'src/pkg/styles/x.scss'))).toBe('$p: 1;\n.a {}')
  })
})
