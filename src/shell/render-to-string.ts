import { Writable } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server'
import type { ReactNode } from 'react'

/**
 * Prerender a React tree to a complete HTML string, waiting for every
 * `<Suspense>` boundary to resolve. Uses React 18's `renderToPipeableStream`
 * with `onAllReady` — equivalent to React 19's `prerenderToNodeStream`. The
 * emitted HTML contains Suspense boundary markers (`<!--$-->...<!--/$-->`)
 * so client `hydrateRoot` can match the tree shape and lazy chunks load
 * only when the corresponding boundary is interacted with.
 */
export const renderToStringAsync = (element: ReactNode): Promise<string> =>
  new Promise((resolve, reject) => {
    let html = ''
    const writable = new Writable({
      write(chunk, _encoding, callback) {
        html += chunk
        callback()
      },
    })
    writable.on('finish', () => resolve(html))
    writable.on('error', reject)

    let didError = false
    const { pipe } = renderToPipeableStream(element, {
      onAllReady() {
        if (didError) return
        pipe(writable)
      },
      onError(err) {
        didError = true
        reject(err as Error)
      },
    })
  })
