import process from 'node:process'
import type { NextApiRequest, NextApiResponse } from 'next'
import path from 'node:path'
import send from 'send'
import { ServerOptions } from '../types/entrypoint.js'
import { STATIC_PATH } from '../const.js'

interface ModuleNotFoundError extends Error {
  code: string
}

const NOT_FOUND = 'Not found.'

const sendStaticFiles = async (
  req: NextApiRequest,
  res: NextApiResponse,
  requestPath: string,
  staticDirectory: string
) => {
  return new Promise<void>((resolve) => {
    send(req, requestPath, {
      root: staticDirectory,
      dotfiles: 'deny',
      immutable: true,
      maxAge: Number.MAX_SAFE_INTEGER,
    })
      .on('directory', () => {
        res.status(404).end(NOT_FOUND)
      })
      .on('error', (e) => {
        console.warn(`[next-static] Error serving asset: ${e.message}`)
        resolve()
        res.status(404).end(NOT_FOUND)
      })
      .on('finish', resolve)
      .pipe(res)
  })
}

const appContext = process.cwd()
const staticDirectory = path.join(appContext, '.next-static')
const publicClientDirectory = path.join(staticDirectory, 'client')

type ServingOptions = Pick<
  ServerOptions,
  'locale' | 'assetPrefix' | 'linkPrefix' | 'outputMode' | 'domains'
>
type ServingOptionsCb =
  | ServingOptions
  | ((req: NextApiRequest, res: NextApiResponse) => Promise<ServingOptions>)

export const serve =
  <T extends Record<string, unknown>>(
    contextProvider?: (req: NextApiRequest, res: NextApiResponse) => Promise<T>,
    servingOptionsCb?: ServingOptionsCb
  ) =>
  async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    const servingOptions = await (typeof servingOptionsCb === 'function'
      ? servingOptionsCb(req, res)
      : servingOptionsCb)

    const dynamicSlug = Object.keys(req.query).slice(-1)[0]

    if (!Array.isArray(req.query[dynamicSlug])) {
      throw new Error(
        '[next-static] Invalid configuration: Make sure you configured your API route as catch all route, for example: [...someIdentifier].'
      )
    }

    const [...restSlug] = req.query[dynamicSlug] as string[]
    const requestPath = `/${restSlug.join('/')}`

    // all client specific assets will be served through
    if (requestPath.startsWith(`/${STATIC_PATH}`)) {
      const [, ...restFileName] = restSlug
      await sendStaticFiles(
        req,
        res,
        restFileName.join('/'),
        publicClientDirectory
      )
      return
    }

    // handle any other "non-root" requests
    if (!requestPath.startsWith('/render')) {
      res.status(404).end(NOT_FOUND)
      return
    }

    const relativeBaseUrl = req.url?.split('/')?.slice(0, -1)?.join('/')

    try {
      const serveStatic = (
        await (
          await import(path.join(staticDirectory, 'server', 'node-main.js'))
        ).default
      ).default

      const context = await (contextProvider
        ? contextProvider(req, res)
        : Promise.resolve({}))

      const options: ServerOptions = {
        nodeEnv: process.env.NODE_ENV,
        context: appContext,
        loadableStats: path.join(staticDirectory, 'loadable-stats.json'),
        publicPath: `${
          servingOptions?.assetPrefix || ''
        }${relativeBaseUrl}/${STATIC_PATH}`,
        ...servingOptions,
      }
      await serveStatic(req, res, context, options)
    } catch (e) {
      if ((e as ModuleNotFoundError).code === 'MODULE_NOT_FOUND') {
        throw new Error(
          `[next-static] Unable to load static bundle. Please make sure you run "yarn build-static" before.`,
          { cause: e }
        )
      }
      throw e
    }
  }
