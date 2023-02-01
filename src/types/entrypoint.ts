import type { ComponentType } from 'react'
import { DomainLocale } from 'next/dist/server/config-shared.js'

export interface WrapperProps {
  components: JSX.Element[]
}

export type Result<T> = {
  props: T
  components: ComponentType<T>[]
  wrapper?: ComponentType<WrapperProps>
}

export type Entrypoint<Props = {}, Context = {}> = (context: Context) => Promise<Result<Props>>

export type ServerOptions = {
  nodeEnv: 'production' | 'development' | 'test'
  /** the path to the application directory */
  context: string
  /** path to the generated loadable stats file */
  loadableStats: string
  /** path to all assets */
  publicPath: string
  locale?: string
  assetPrefix?: string
  linkPrefix?: string
}

export type NextStaticData = {
  runtimeConfig: Record<string, unknown>
  context: Record<string, unknown>
  publicAssetPath: string
  locales?: string[]
  domains?: DomainLocale[]
  basePath?: string
  defaultLocale?: string
} & Pick<ServerOptions, 'locale' | 'assetPrefix' | 'nodeEnv' | 'linkPrefix'>
