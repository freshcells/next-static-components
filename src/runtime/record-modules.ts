import { AsyncLocalStorage } from 'node:async_hooks'
import { setRecordHandler } from '../next-dynamic-shim.js'

// Per-render set of source-module ids whose dynamic-import wrappers
// rendered during this SSR pass. Populated by the dynamic-shim wrapper via
// the record handler installed below; consumed by the shell server to look
// up only the chunks that actually streamed.
export const renderedModulesStore = new AsyncLocalStorage<Set<string>>()

setRecordHandler((id) => {
  renderedModulesStore.getStore()?.add(id)
})
