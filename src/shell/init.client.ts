import { NextStaticData } from '../types/entrypoint.js'
import { setConfig } from 'next/config.js'

declare let __webpack_public_path__: string

declare global {
  interface Window {
    /* prod */
    __NEXT_STATIC_DATA__: NextStaticData
  }
}

const initialData = JSON.parse(
  document.getElementById('__NEXT_STATIC_DATA__')!.textContent!
) as NextStaticData

window.__NEXT_STATIC_DATA__ = initialData

window.__NEXT_DATA__ = {
  props: { pageProps: {} },
  page: '',
  query: {},
  buildId: '',
}

// Initialize next/config with the environment configuration
setConfig({
  serverRuntimeConfig: {},
  publicRuntimeConfig: initialData.runtimeConfig || {},
})

// we have to make sure that any additional async requests are
// resolved through our public asset path (which can also be a different domain)
__webpack_public_path__ = initialData.publicAssetPath
