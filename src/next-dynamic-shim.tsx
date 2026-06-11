import * as React from 'react'
import { lazy, Suspense } from 'react'

type AnyComponent = React.ComponentType<Record<string, unknown>>
type ImportedModule = { default: AnyComponent } | AnyComponent
type Loader = () => Promise<ImportedModule>

interface DynamicOptions {
  ssr?: boolean
  loading?: AnyComponent
  loader?: Loader
  // legacy next/dynamic options accepted but unused
  suspense?: boolean
  loadableGenerated?: unknown
  // internal — set by the record-imports plugin, never manually
  __nscModuleId?: string
}

const isServer = typeof window === 'undefined'

const extractDefault = (mod: ImportedModule): AnyComponent =>
  mod && typeof mod === 'object' && 'default' in mod
    ? (mod as { default: AnyComponent }).default
    : (mod as AnyComponent)

const DefaultLoading: AnyComponent = () => null

// SSR runtime hook capturing which lazy boundaries rendered; stays null in the browser
type RecordHandler = (moduleId: string) => void
let recordHandler: RecordHandler | null = null
export const setRecordHandler = (h: RecordHandler | null) => {
  recordHandler = h
}

/** `next/dynamic` replacement backed by `React.lazy` + `Suspense` (streaming SSR). */
const dynamic = (loader: Loader, options: DynamicOptions = {}): AnyComponent => {
  const moduleId = options.__nscModuleId

  if (options.ssr === false && isServer) {
    const Loading = options.loading || DefaultLoading
    return (props) => React.createElement(Loading, props)
  }

  const LazyComponent = lazy(async () => {
    const mod = await loader()
    return { default: extractDefault(mod) }
  })
  const Fallback = options.loading || DefaultLoading

  return (props) => {
    // every render, not just load — React.lazy caches the loader per process
    if (moduleId && recordHandler) recordHandler(moduleId)
    return React.createElement(
      Suspense,
      { fallback: React.createElement(Fallback) },
      React.createElement(LazyComponent, props),
    )
  }
}

/** Injected by the record-imports plugin around every `dynamic(...)` callsite. */
export const __nscDynamic = (
  moduleId: string,
  loader: Loader,
  options: DynamicOptions = {},
): AnyComponent => dynamic(loader, { ...options, __nscModuleId: moduleId })

export default dynamic
