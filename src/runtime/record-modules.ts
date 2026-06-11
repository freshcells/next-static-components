import { AsyncLocalStorage } from 'node:async_hooks'
import { setRecordHandler } from '../next-dynamic-shim.js'

// per-render set of module ids whose dynamic-import wrappers rendered this SSR pass
export const renderedModulesStore = new AsyncLocalStorage<Set<string>>()

setRecordHandler((id) => {
  renderedModulesStore.getStore()?.add(id)
})
