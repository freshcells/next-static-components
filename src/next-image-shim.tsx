import * as React from 'react'
// `.js` specifier dodges our `^next/image$` alias; unwrap because the
// component sits at `ns.default.default` under Node ESM
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

// client: fixed per page load, cache; SSR: per-request via ALS, call through
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

// module-level for stable function identity; prefix read at call time
const defaultLoader: ImageLoader = ({ src, width, quality }) => {
  const prefix = readAssetPrefix().replace(/\/+$/, '')
  return `${prefix}/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality ?? 75}`
}

/** `next/image` with the optimizer endpoint prefixed by the runtime `assetPrefix`. */
const Image: React.FC<ImageProps> = (props) =>
  React.createElement(NextImage, { ...props, loader: props.loader ?? defaultLoader })

export default Image
