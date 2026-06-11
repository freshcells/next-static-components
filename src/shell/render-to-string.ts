import { Writable } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server'
import type { ReactNode } from 'react'

/** Prerenders to a full HTML string with all `<Suspense>` boundaries resolved. */
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
