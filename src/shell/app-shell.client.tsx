import { loadableReady } from '@loadable/component'
import ReactDOM from 'react-dom'
import React from 'react'
import { ApplicationRoot } from './components/ApplicationRoot.js'
import application from '@main'

async function init() {
  const { locale, locales, basePath, domains, defaultLocale, linkPrefix, context } =
    window.__NEXT_STATIC_DATA__

  await loadableReady()

  const { components, props } = await application(context)

  for (const [index, Component] of components.entries()) {
    const selector = `[data-next-static-index="${index}"]`
    const root = document.querySelector(selector)
    if (!root) {
      throw new Error(
        `[next-static] Unable to rehydrate static root. Cannot find selector ${selector}.`
      )
    }
    ReactDOM.hydrate(
      <ApplicationRoot
        locale={locale}
        domains={domains}
        defaultLocale={defaultLocale}
        locales={locales}
        basePath={basePath}
        linkPrefix={linkPrefix}
      >
        <Component {...props} />
      </ApplicationRoot>,
      root
    )
  }
}

;(async () => {
  try {
    await init()
  } catch (e) {
    console.error(`[next-static] Error during application init.`, e)
  }
})()
