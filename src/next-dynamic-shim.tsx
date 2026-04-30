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
  // Internal — set by the `record-imports` Vite plugin so the wrapper can
  // report its module id back through `recordHandler` on every render. Not
  // part of the public API; never set this manually.
  __nscModuleId?: string
}

const isServer = typeof window === 'undefined'

const extractDefault = (mod: ImportedModule): AnyComponent =>
  mod && typeof mod === 'object' && 'default' in mod
    ? (mod as { default: AnyComponent }).default
    : (mod as AnyComponent)

const DefaultLoading: AnyComponent = () => null

// Pluggable hook the SSR runtime uses to capture which lazy boundaries
// rendered during a request. Stays null in the browser bundle so the
// wrapper component is a plain Suspense+lazy with no overhead.
type RecordHandler = (moduleId: string) => void
let recordHandler: RecordHandler | null = null
export const setRecordHandler = (h: RecordHandler | null) => {
  recordHandler = h
}

/**
 * `next/dynamic` replacement backed by `React.lazy` + `Suspense`. Server
 * renders use streaming SSR (`renderToPipeableStream` with `onAllReady`) so
 * Suspense boundaries resolve before the prerender completes — the emitted
 * HTML contains the resolved content with Suspense markers. Client
 * `hydrateRoot` matches those markers; lazy chunks load only when a
 * boundary is actually rendered/needed, so unrendered branches (e.g.
 * other-locale modules) never download on the client.
 */
const dynamic = (loader: Loader, options: DynamicOptions = {}): AnyComponent => {
  const moduleId = options.__nscModuleId

  // SSR opt-out: render the user-provided loading placeholder on the server
  // instead of the lazy component. Same semantics as `next/dynamic({ ssr: false })`.
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
    // Run on every render so a per-request rendered-modules set captures
    // this boundary even after React.lazy has cached the resolved module
    // (the loader fires only once per process).
    if (moduleId && recordHandler) recordHandler(moduleId)
    return React.createElement(
      Suspense,
      { fallback: React.createElement(Fallback) },
      React.createElement(LazyComponent, props)
    )
  }
}

/**
 * Helper injected by the SSR `record-imports` build plugin around every
 * `dynamic(...)` callsite. Threads a manifest-key module id into the
 * options bag so the runtime wrapper can record it.
 */
export const __nscDynamic = (
  moduleId: string,
  loader: Loader,
  options: DynamicOptions = {}
): AnyComponent => dynamic(loader, { ...options, __nscModuleId: moduleId })

export default dynamic
