import type { ComponentType, JSX } from 'react'
import { DomainLocale } from 'next/dist/server/config-shared.js'
import { ParsedUrlQuery } from 'querystring'
import { NextApiRequest, NextApiResponse } from 'next'

export interface WrapperProps {
  components: JSX.Element[]
}

export type Result<T> = {
  props: T
  components: ComponentType<T>[]
  wrapper?: ComponentType<WrapperProps>
  additionalHeadElement?: JSX.Element
}

export type Entrypoint<Props = {}, Context = {}> = (context: Context) => Promise<Result<Props>>

export type OutputMode =
  | 'html'
  | 'jsonp'
  | ((
      req: NextApiRequest,
      res: NextApiResponse,
      result: {
        styles: string
        head: string
        content: string
        scripts: string
      },
    ) => void)

export type ServerOptions = {
  nodeEnv: 'production' | 'development' | 'test'
  /** the path to the application directory */
  context: string
  /** path to the generated Vite client manifest (.vite/manifest.json) */
  clientManifest: string
  /** path to all assets, prefixed with the consumer's assetPrefix */
  publicPath: string
  /** dev mode: when true, asset injection is delegated to Vite's transformIndexHtml */
  devMode?: boolean
  /** dev mode: pre-collected asset URLs from Vite dev server */
  devAssets?: {
    entryScripts: string[]
    modulePreloads: string[]
    stylesheets: string[]
  }
  outputMode?: OutputMode
  domains?: DomainLocale[]
  defaultLocale?: string
  locales?: string[]
  locale?: string
  assetPrefix?: string
  linkPrefix?: string
  query?: ParsedUrlQuery
}

export type NextStaticData = {
  runtimeConfig: Record<string, unknown>
  context: Record<string, unknown>
  publicAssetPath: string
  basePath?: string
  query?: ParsedUrlQuery
} & Pick<
  ServerOptions,
  'domains' | 'defaultLocale' | 'locale' | 'locales' | 'assetPrefix' | 'nodeEnv' | 'linkPrefix'
>
