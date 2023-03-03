import { loadableReady } from '@loadable/component'
import ReactDOM from 'react-dom'
import React from 'react'
import { ApplicationRoot } from './components/ApplicationRoot.js'
import application from '@main'
import { EV_AFTER_HYDRATION, EV_BEFORE_HYDRATION } from '../server/events.js'

async function init() {
  if (typeof window.__NEXT_STATIC_DATA__ === 'undefined') {
    throw new Error(
      '[next-static]: Client side rendering expected `__NEXT_STATIC_DATA__` to be defined.'
    )
  }
  const {
    locale,
    locales,
    basePath,
    domains,
    defaultLocale,
    linkPrefix,
    context,
    query,
  } = window.__NEXT_STATIC_DATA__
  window.dispatchEvent(new CustomEvent(EV_BEFORE_HYDRATION))

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
        query={query}
      >
        <Component {...props} />
      </ApplicationRoot>,
      root
    )
  }
  window.dispatchEvent(new CustomEvent(EV_AFTER_HYDRATION))
}

;(async () => {
  try {
    await init()
  } catch (e) {
    console.error(`[next-static] Error during application init.`, e)
  }
})()
