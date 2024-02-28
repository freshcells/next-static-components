import { loadableReady } from '@loadable/component'
import ReactDOM from 'react-dom'
import React from 'react'
import { EV_AFTER_HYDRATION, EV_BEFORE_HYDRATION } from '../server/events.js'
import { NextStaticData } from '../types/entrypoint.js'
import { ApplicationRoot } from './components/ApplicationRoot.js'
import application from '@main'

declare global {
  interface Window {
    /* prod */
    __NEXT_STATIC_CONTEXT_EXTEND__: Pick<NextStaticData, 'context'>
  }
}

async function init() {
  try {
    window.dispatchEvent(new CustomEvent(EV_BEFORE_HYDRATION))

    await loadableReady()

    const initialData = JSON.parse(
      document.getElementById('__NEXT_STATIC_DATA__')!.textContent!
    ) as NextStaticData

    const thisInitialData = (initialData || {}) as NextStaticData

    const config = {
      ...thisInitialData,
      context: {
        ...thisInitialData.context,
        ...(window.__NEXT_STATIC_CONTEXT_EXTEND__ || {}),
      },
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
    } = config

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
  } catch (e) {
    console.error(`[next-static] Error during application init.`, e)
  }
}

;(() => {
  if (document.readyState !== 'loading') {
    return init()
  }
  document.addEventListener('DOMContentLoaded', init)
})()
