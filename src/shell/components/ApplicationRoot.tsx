import React, { PropsWithChildren } from 'react'
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime.js'
import { createClientRouter, createServerRouter } from './router.js'
import { DomainLocale } from 'next/dist/server/config-shared.js'
import { ParsedUrlQuery } from 'querystring'

interface Props {
  locale?: string
  defaultLocale?: string
  domains?: DomainLocale[]
  locales?: string[]
  basePath?: string
  linkPrefix?: string
  query?: ParsedUrlQuery
}

export const ApplicationRoot = ({
  children,
  basePath,
  locales,
  locale,
  defaultLocale,
  linkPrefix,
  domains,
  query,
}: PropsWithChildren<Props>) => {
  return (
    <RouterContext.Provider
      value={
        typeof window === 'undefined'
          ? createServerRouter(
              locale,
              defaultLocale,
              locales,
              domains,
              basePath,
              linkPrefix,
              query
            )
          : createClientRouter(
              locale,
              defaultLocale,
              locales,
              domains,
              basePath,
              linkPrefix,
              query
            )
      }
    >
      {children}
    </RouterContext.Provider>
  )
}
