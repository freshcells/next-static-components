import { type ChildProcess, execSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const fixtureDir = fileURLToPath(new URL('../fixture', import.meta.url))

export const waitForUrl = async (
  url: string,
  deadlineMs: number,
  accept: (s: number) => boolean,
) => {
  const deadline = Date.now() + deadlineMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (accept(res.status)) return
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Url ${url} didn't reach the expected state within ${deadlineMs}ms`)
}

export const buildFixture = (env: NodeJS.ProcessEnv = {}) => {
  execSync('yarn build-static', { cwd: fixtureDir, stdio: 'pipe', env: { ...process.env, ...env } })
}

/** Spawns `next dev` on the given port and resolves once the catch-all route responds. */
export const startFixtureServer = async (port: number): Promise<ChildProcess> => {
  const proc = spawn('yarn', ['next', 'dev', '-p', String(port)], {
    cwd: fixtureDir,
    stdio: 'pipe',
    detached: true,
    env: { ...process.env, NODE_ENV: 'development' },
  })
  proc.stdout?.on('data', () => {})
  proc.stderr?.on('data', () => {})

  const baseUrl = `http://localhost:${port}`
  try {
    // generous windows — a cold Turbopack compile after a dist rebuild can take minutes
    await waitForUrl(baseUrl, 120_000, (s) => s > 0)
    await waitForUrl(`${baseUrl}/api/static/render`, 120_000, (s) => s === 200)
  } catch (e) {
    // a leaked instance keeps listening and wedges every later run
    await stopFixtureServer(proc)
    throw e
  }
  return proc
}

export const stopFixtureServer = async (proc: ChildProcess | undefined) => {
  if (!proc || proc.killed) return
  // SIGKILL the whole subtree — killing yarn doesn't always cascade to next
  try {
    if (proc.pid) process.kill(-proc.pid, 'SIGKILL')
  } catch {
    proc.kill('SIGKILL')
  }
  await new Promise<void>((r) => {
    proc.on('close', () => r())
    setTimeout(r, 5_000).unref()
  })
}
