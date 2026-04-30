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
}

const isServer = typeof window === 'undefined'

const extractDefault = (mod: ImportedModule): AnyComponent =>
  mod && typeof mod === 'object' && 'default' in mod
    ? (mod as { default: AnyComponent }).default
    : (mod as AnyComponent)

const DefaultLoading: AnyComponent = () => null

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

  return (props) =>
    React.createElement(
      Suspense,
      { fallback: React.createElement(Fallback) },
      React.createElement(LazyComponent, props)
    )
}

export default dynamic
