import type { ComponentType } from 'react'
import { DomainLocale } from 'next/dist/server/config-shared.js'
import { ParsedUrlQuery } from 'querystring'

export interface WrapperProps {
  components: JSX.Element[]
}

export type Result<T> = {
  props: T
  components: ComponentType<T>[]
  wrapper?: ComponentType<WrapperProps>
  additionalHeadElement?: JSX.Element
}

export type Entrypoint<Props = {}, Context = {}> = (
  context: Context
) => Promise<Result<Props>>

export type OutputMode = 'html' | 'jsonp'

export type ServerOptions = {
  nodeEnv: 'production' | 'development' | 'test'
  /** the path to the application directory */
  context: string
  /** path to the generated loadable stats file */
  loadableStats: string
  /** path to all assets */
  publicPath: string
  outputMode?: OutputMode
  locale?: string
  assetPrefix?: string
  linkPrefix?: string
  query?: ParsedUrlQuery
}

export type NextStaticData = {
  runtimeConfig: Record<string, unknown>
  context: Record<string, unknown>
  publicAssetPath: string
  locales?: string[]
  domains?: DomainLocale[]
  basePath?: string
  defaultLocale?: string
  query?: ParsedUrlQuery
} & Pick<ServerOptions, 'locale' | 'assetPrefix' | 'nodeEnv' | 'linkPrefix'>
