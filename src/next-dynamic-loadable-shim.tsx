import loadable, {
  type DefaultComponent,
  DefaultImportedComponent,
} from '@loadable/component'
import { type DynamicOptions } from 'next/dynamic.js'
import * as React from 'react'

let thisLoadable = loadable.default || loadable

type DynamicImport = Parameters<typeof thisLoadable>

const Fallback = () => <span>...</span>

export const resolvedModules = new Map()

export const allModulePromises = new Set()

export const preloadAll = async () => {
  await Promise.all(allModulePromises.entries())
}

/**
 * This will translate the `next/dynamic` import into `@loadable/components`.
 */
export default function (
  dynamicImport: DynamicImport[0],
  options: DynamicOptions
) {
  // ... only do that on the server ...
  if (typeof window === 'undefined') {
    // We have to use the cjs version on the server due to react-context issues
    thisLoadable = require('@loadable/component').default
    // It seems like `requireSync` may return a promise in certain cases. Very likely due to the fact
    // that webpack builds the bundle for node >= 12.2, but @loadable & webpack (used with `target: "node"`) did not catch up to that fact.
    // so the following is a bit hacky but allows us to preload all promises before rendering
    // and then return the right component in `resolveComponent`.
    const possiblePromise =
      // @ts-ignore
      'requireSync' in dynamicImport && dynamicImport.requireSync()
    if (!possiblePromise) {
      throw new Error(
        `[next-static] Unable to convert dynamic import of ${String(
          possiblePromise
        )}. Please make sure you have the latest version (>= 5.16.1 of \`@loadable/babel-plugin\`) installed`
      )
    }
    if (possiblePromise.then) {
      if (!resolvedModules.has(possiblePromise)) {
        allModulePromises.add(
          possiblePromise.then((result: DefaultComponent<unknown>) => {
            resolvedModules.set(
              possiblePromise,
              (result as DefaultImportedComponent<unknown>).default || result
            )
          })
        )
      }
    }
  }
  return thisLoadable(dynamicImport, {
    ssr: options?.ssr,
    fallback: options?.loader as unknown as JSX.Element,
    resolveComponent: (
      module: Promise<DefaultComponent<unknown>> | DefaultComponent<unknown>
    ) => {
      if ((module as Promise<DefaultComponent<unknown>>).then) {
        if (!resolvedModules.has(module)) {
          // this case should never happen
          return Fallback
        }
        return resolvedModules.get(module)
      }
      return (module as DefaultImportedComponent<unknown>).default || module
    },
  })
}
