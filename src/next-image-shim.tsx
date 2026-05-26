import * as React from 'react'
// `next/image.js` (not `next/image`): our `^next/image$` alias points to
// this file, so the `.js` specifier dodges the alias and reaches the real
// implementation. Namespace + unwrap below because `next/image.js` skips
// the `module.exports = exports.default` interop fixup `next/link.js`
// does, so the component sits at `ns.default.default` under Node ESM.
import * as NextImageNs from 'next/image.js'
import type { ImageProps, ImageLoader } from 'next/image.js'

const isReactType = (v: unknown): boolean =>
  typeof v === 'function' ||
  (v != null && typeof v === 'object' && '$$typeof' in (v as Record<string, unknown>))

const unwrapDefault = <T,>(mod: unknown): T => {
  let candidate = mod as { default?: unknown } | unknown
  for (let i = 0; i < 5 && !isReactType(candidate); i++) {
    const next = (candidate as { default?: unknown } | null)?.default
    if (next == null) break
    candidate = next
  }
  return candidate as T
}

const NextImage = unwrapDefault<React.ComponentType<ImageProps>>(NextImageNs)

export const getImageProps = (
  NextImageNs as unknown as typeof NextImageNs & { getImageProps: unknown }
).getImageProps as (typeof NextImageNs)['getImageProps']
export type { ImageProps, ImageLoaderProps, ImageLoader, StaticImageData } from 'next/image.js'

const isServer = typeof window === 'undefined'

interface AssetPrefixHook {
  __NEXT_STATIC_ASSET_PREFIX__?: () => string | undefined
}

// Client-side: `__NEXT_STATIC_DATA__` is fixed per page load, so parse
// once and cache. SSR-side: per-request via ALS, must call through.
let cachedClientPrefix: string | null = null
const readAssetPrefix = (): string => {
  if (isServer) {
    return (globalThis as unknown as AssetPrefixHook).__NEXT_STATIC_ASSET_PREFIX__?.() ?? ''
  }
  if (cachedClientPrefix !== null) return cachedClientPrefix
  try {
    const el = document.getElementById('__NEXT_STATIC_DATA__')
    const data = el?.textContent ? (JSON.parse(el.textContent) as { assetPrefix?: string }) : {}
    cachedClientPrefix = data.assetPrefix ?? ''
  } catch {
    cachedClientPrefix = ''
  }
  return cachedClientPrefix
}

// Module-level so `next/image` sees a stable function identity; the
// prefix is read at call time, not module load.
const defaultLoader: ImageLoader = ({ src, width, quality }) => {
  const prefix = readAssetPrefix().replace(/\/+$/, '')
  return `${prefix}/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality ?? 75}`
}

/**
 * `next/image` wrapper that prefixes `/_next/image` with the runtime
 * `assetPrefix` so cross-origin embeds hit the static-app's optimizer.
 * A user-supplied `loader` prop still wins.
 */
const Image: React.FC<ImageProps> = (props) =>
  React.createElement(NextImage, { ...props, loader: props.loader ?? defaultLoader })

export default Image
