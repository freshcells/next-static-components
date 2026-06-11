import process from 'node:process'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import type { NextApiRequest, NextApiResponse } from 'next'
import path from 'node:path'
import send from 'send'
import { ServerOptions } from '../types/entrypoint.js'
import { STATIC_PATH } from '../const.js'

interface ModuleNotFoundError extends Error {
  code: string
}

const NOT_FOUND = 'Not found.'
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000

const isDev = process.env.NODE_ENV === 'development'

const sendStaticFiles = async (
  req: NextApiRequest,
  res: NextApiResponse,
  requestPath: string,
  staticDirectory: string,
) => {
  return new Promise<void>((resolve) => {
    const fail = () => {
      res.statusCode = 404
      res.end(NOT_FOUND)
      resolve()
    }
    send(req, requestPath, {
      root: staticDirectory,
      dotfiles: 'deny',
      // dev = stable filenames, revalidate; prod = hashed, cache a year
      immutable: !isDev,
      maxAge: isDev ? 0 : ONE_YEAR_MS,
    })
      .on('directory', fail)
      .on('error', (e) => {
        console.warn(`[next-static] Error serving asset: ${e.message}`)
        fail()
      })
      .on('end', () => resolve())
      .pipe(res)
  })
}

const appContext = process.cwd()
const staticDirectory = path.join(appContext, '.next-static')
const publicClientDirectory = path.join(staticDirectory, 'client')
const clientManifestPath = path.join(publicClientDirectory, '.vite', 'manifest.json')
const serverEntryPath = path.join(staticDirectory, 'server', 'node-main.mjs')

type ServeStaticFn = (
  req: NextApiRequest,
  res: NextApiResponse,
  context: Record<string, unknown>,
  options: ServerOptions,
) => Promise<void>

// `?v=mtime` re-imports are only safe for single-file (dev) bundles — split chunks
// would duplicate Context singletons. Gate on bundle shape, not NODE_ENV: prod
// build + `yarn dev` is a normal flow.
const isDevBundle = !fs.existsSync(path.join(staticDirectory, 'server', 'chunks'))

let cachedFor: { mtime: number; promise: Promise<ServeStaticFn> } | null = null

const loadServeStatic = (): Promise<ServeStaticFn> => {
  let mtime = 0
  if (isDevBundle) {
    try {
      mtime = fs.statSync(serverEntryPath).mtimeMs
    } catch {
      // first build still running — import will reject
    }
  }

  if (cachedFor && cachedFor.mtime === mtime) return cachedFor.promise

  const promise = (async () => {
    const baseUrl = pathToFileURL(serverEntryPath).href
    const url = isDevBundle ? `${baseUrl}?v=${mtime}` : baseUrl
    // ignore-comments keep Next.js's bundler from statically analyzing the runtime URL
    const mod = await import(
      /* @vite-ignore */ /* webpackIgnore: true */ /* turbopackIgnore: true */ url
    )
    const fn = typeof mod.default === 'function' ? mod.default : mod.default?.default
    if (typeof fn !== 'function') {
      throw new Error('[next-static] node-main.mjs did not export a default render function.')
    }
    return fn as ServeStaticFn
  })()
  promise.catch(() => {
    if (cachedFor && cachedFor.promise === promise) cachedFor = null
  })
  cachedFor = { mtime, promise }
  return promise
}

type ServingOptions = Pick<
  ServerOptions,
  'locale' | 'defaultLocale' | 'locales' | 'assetPrefix' | 'linkPrefix' | 'outputMode' | 'domains'
>
type ServingOptionsCb<T> =
  | ServingOptions
  | ((req: NextApiRequest, res: NextApiResponse, context: T) => Promise<ServingOptions>)

export const serve =
  <T extends Record<string, unknown>>(
    contextProvider?: (req: NextApiRequest, res: NextApiResponse) => Promise<T>,
    servingOptionsCb?: ServingOptionsCb<T>,
  ) =>
  async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    const dynamicSlug = Object.keys(req.query).slice(-1)[0]

    if (!Array.isArray(req.query[dynamicSlug])) {
      throw new Error(
        '[next-static] Invalid configuration: Make sure you configured your API route as catch all route, for example: [...someIdentifier].',
      )
    }

    const [...restSlug] = req.query[dynamicSlug] as string[]
    const requestPath = `/${restSlug.join('/')}`

    if (requestPath.startsWith(`/${STATIC_PATH}`)) {
      const [, ...restFileName] = restSlug
      await sendStaticFiles(req, res, restFileName.join('/'), publicClientDirectory)
      return
    }

    if (!requestPath.startsWith('/render')) {
      res.status(404).end(NOT_FOUND)
      return
    }

    const rootBaseUrl = new URL(req.url?.replace(requestPath, '') || '', 'https://localhost')
      ?.pathname

    try {
      const serveStatic = await loadServeStatic()

      const context: T = await (contextProvider
        ? contextProvider(req, res)
        : Promise.resolve({} as T))

      const servingOptions = await (typeof servingOptionsCb === 'function'
        ? servingOptionsCb(req, res, context)
        : servingOptionsCb)

      const options: ServerOptions = {
        nodeEnv: process.env.NODE_ENV,
        context: appContext,
        clientManifest: clientManifestPath,
        publicPath: `${servingOptions?.assetPrefix || ''}${path.posix.join(
          rootBaseUrl,
          STATIC_PATH,
        )}`,
        ...servingOptions,
      }
      await serveStatic(req, res, context, options)
    } catch (e) {
      if ((e as ModuleNotFoundError).code === 'MODULE_NOT_FOUND') {
        throw new Error(
          `[next-static] Unable to load static bundle. Please make sure you run "yarn build-static" before.`,
          { cause: e },
        )
      }
      throw e
    }
  }
