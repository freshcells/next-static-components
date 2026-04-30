import { NextStaticData } from '../types/entrypoint.js'

const info = JSON.parse(
  document.getElementById('__NEXT_STATIC_INFO__')!.textContent!
) as Pick<NextStaticData, 'publicAssetPath' | 'runtimeConfig' | 'query'>

window.__NEXT_DATA__ = {
  props: { pageProps: {} },
  page: '',
  query: info.query || {},
  buildId: '',
}
