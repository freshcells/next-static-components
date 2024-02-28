import { NextStaticData } from '../types/entrypoint.js'
import { setConfig } from 'next/config.js'

declare let __webpack_public_path__: string

const info = JSON.parse(
    document.getElementById('__NEXT_STATIC_INFO__')!.textContent!
) as Pick<NextStaticData, 'publicAssetPath' | 'runtimeConfig' | 'query'>

window.__NEXT_DATA__ = {
  props: { pageProps: {} },
  page: '',
  query: info.query || {},
  buildId: '',
}

// Initialize next/config with the environment configuration
setConfig({
  serverRuntimeConfig: {},
  publicRuntimeConfig: info.runtimeConfig || {},
})

// we have to make sure that any additional async requests are
// resolved through our public asset path (which can also be a different domain)
__webpack_public_path__ = info.publicAssetPath
