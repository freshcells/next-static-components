import type { NextApiRequest, NextApiResponse } from 'next'
import { EV_BEFORE_HYDRATION } from './events.js'

// see https://github.com/expressjs/express/blob/158a17031a2668269aedb31ea07b58d6b700272b/lib/response.js#L293
export const sendAsJsonP = (
  body: Record<string, unknown>,
  res: NextApiResponse,
  req: NextApiRequest
) => {
  let { callback } = req.query

  if (Array.isArray(callback)) {
    callback = callback[0]
  }

  if (typeof callback === 'string' && callback.length !== 0) {
    let bodyValue = JSON.stringify(body, null, 2)

    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Type', 'text/javascript')

    // restrict callback charset
    callback = callback.replace(/[^\[\]\w$.]/g, '')

    if (bodyValue === undefined) {
      // body could not be serialized
      throw new Error(
        `[next-static] (jsonp) expected body to be serializable, got undefined.`
      )
    }

    // replace chars not allowed in JavaScript that are in JSON
    bodyValue = bodyValue
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029')

    // the /**/ is a specific security mitigation for "Rosetta Flash JSONP abuse"
    // the typeof check is just to reduce client error noise
    return res.send(
      // language=JS
      `/**/ typeof ${callback} === 'function' && ${callback}((function (manifest) {
          return function (rootElement, customContext) {
              if (customContext) {
                  if (!(typeof customContext === 'object')) {
                      console.warn('[next-static]: custom configuration was not of type object. Initialization stopped.');
                      return Promise.reject();
                  }
                  window.__NEXT_STATIC_CONTEXT_EXTEND__ = customContext;
              }
              if (rootElement && !(rootElement instanceof HTMLElement)) {
                  console.warn('[next-static]: "rootElement" was provided but not of expected type HTMLElement, please provide a valid element.');
                  return Promise.reject();
              }
              const thisElement = rootElement && rootElement instanceof HTMLElement ? rootElement : document.body;
              const scriptNode = document.createRange().createContextualFragment(manifest.scripts);
              const applicationRoot = document.createElement('div');
              applicationRoot.setAttribute('data-next-static-outer-root', 'true')
              applicationRoot.style.cssText = 'visibility: hidden;';
              applicationRoot.insertAdjacentHTML('beforeend', manifest.content)
              thisElement.insertAdjacentHTML('afterbegin', manifest.styles)
              thisElement.appendChild(applicationRoot)
              thisElement.appendChild(scriptNode)
              return new Promise(function (resolve) {
                  window.addEventListener('${EV_BEFORE_HYDRATION}', function eventCapture() {
                      resolve();
                      applicationRoot.style.cssText = 'visibility: visible;';
                      window.removeEventListener('${EV_BEFORE_HYDRATION}', eventCapture);
                  })
              })
          }
      })(${bodyValue}));`
    )
  }
  return res.json(body)
}
