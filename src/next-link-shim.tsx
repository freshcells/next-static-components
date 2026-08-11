import * as React from 'react'
// type-only; the `^next/link$` alias is build-time only, tsc sees the real types
import type { LinkProps as InternalLinkProps } from 'next/link.js'
import { formatUrl } from 'next/dist/shared/lib/router/utils/format-url.js'
import { isAbsoluteUrl } from 'next/dist/shared/lib/utils.js'
import { RouterContext } from './context.js'
import { resolveLinkHref } from './shell/components/i18n.js'

type LinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof InternalLinkProps> &
  InternalLinkProps & { children?: React.ReactNode }

const isModifiedEvent = (event: React.MouseEvent<HTMLAnchorElement>): boolean => {
  const target = event.currentTarget.getAttribute('target')
  return Boolean(
    (target && target !== '_self') ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (event.nativeEvent && event.nativeEvent.which === 2),
  )
}

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function StaticLink(props, ref) {
  const {
    href,
    as,
    children,
    prefetch: _prefetch,
    passHref: _passHref,
    replace: _replace,
    shallow: _shallow,
    scroll: _scroll,
    legacyBehavior: _legacyBehavior,
    transitionTypes: _transitionTypes,
    locale,
    onClick,
    onNavigate,
    ...rest
  } = props
  const router = React.useContext(RouterContext)
  const finalHref = React.useMemo(
    () => resolveLinkHref(router, href, as, locale),
    [router, href, as, locale],
  )
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (!onNavigate || e.defaultPrevented) {
      return
    }
    if (isModifiedEvent(e) || e.currentTarget.hasAttribute('download')) {
      return
    }
    if (isAbsoluteUrl(typeof href === 'string' ? href : formatUrl(href))) {
      return
    }
    let navigationPrevented = false
    onNavigate({
      preventDefault: () => {
        navigationPrevented = true
      },
    })
    if (navigationPrevented) {
      e.preventDefault()
    }
  }
  return (
    <a {...rest} ref={ref} href={finalHref} onClick={handleClick}>
      {children}
    </a>
  )
})

export const useLinkStatus = () => ({ pending: false })

export default Link
