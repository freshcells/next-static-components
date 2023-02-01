import React, { PropsWithChildren } from 'react'
import { RouterContext } from 'next/dist/shared/lib/router-context.js'
import { createClientRouter, createServerRouter } from './router.js'
import { DomainLocale } from 'next/dist/server/config-shared.js'

interface Props {
  locale?: string
  defaultLocale?: string
  domains?: DomainLocale[]
  locales?: string[]
  basePath?: string
  linkPrefix?: string
}
export const ApplicationRoot = ({
  children,
  basePath,
  locales,
  locale,
  defaultLocale,
  linkPrefix,
  domains,
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
              linkPrefix
            )
          : createClientRouter(
              locale,
              defaultLocale,
              locales,
              domains,
              basePath,
              linkPrefix
            )
      }
    >
      {children}
    </RouterContext.Provider>
  )
}
