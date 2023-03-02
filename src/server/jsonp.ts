import type { NextApiRequest, NextApiResponse } from 'next'

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
      console.error(
        `[next-static] expected object to be serializable. Unable to serve json.`
      )
      return res.status(500).send('Unable to process request.')
    }

    // replace chars not allowed in JavaScript that are in JSON
    bodyValue = bodyValue
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029')

    // the /**/ is a specific security mitigation for "Rosetta Flash JSONP abuse"
    // the typeof check is just to reduce client error noise
    return res.send(
      `/**/ typeof ${callback} === \'function\' && ${callback}(${bodyValue});`
    )
  }
  return res.json(body)
}
