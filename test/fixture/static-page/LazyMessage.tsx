import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

export default function LazyMessage() {
  const { locale, domainLocales } = useRouter()
  const linkDomain = domainLocales?.[0]?.domain
  return (
    <>
      <p data-testid="lazy-message">Hello from a lazy component!</p>
      <Link data-testid="router-link" href="/details">
        Read more ({locale})
      </Link>
      <span data-testid="link-domain">{linkDomain}</span>
    </>
  )
}
