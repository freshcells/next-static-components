import { NextStaticData } from '../types/entrypoint.js'
import { setConfig } from 'next/config.js'

declare let __webpack_public_path__: string

declare global {
  interface Window {
    /* prod */
    __NEXT_STATIC_DATA__: NextStaticData
    __NEXT_STATIC_CONTEXT_EXTEND__: Pick<NextStaticData, 'context'>
  }
}

const initialData = JSON.parse(
  document.getElementById('__NEXT_STATIC_DATA__')!.textContent!
) as NextStaticData

const thisInitialData = (initialData || {}) as NextStaticData

window.__NEXT_STATIC_DATA__ = {
  ...thisInitialData,
  context: {
    ...thisInitialData.context,
    ...(window.__NEXT_STATIC_CONTEXT_EXTEND__ || {}),
  },
}

window.__NEXT_DATA__ = {
  props: { pageProps: {} },
  page: '',
  query: thisInitialData.query || {},
  buildId: '',
}

// Initialize next/config with the environment configuration
setConfig({
  serverRuntimeConfig: {},
  publicRuntimeConfig: thisInitialData.runtimeConfig || {},
})

// we have to make sure that any additional async requests are
// resolved through our public asset path (which can also be a different domain)
__webpack_public_path__ = thisInitialData.publicAssetPath
