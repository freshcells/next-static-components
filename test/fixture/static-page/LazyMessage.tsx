import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/router'
import testImg from './test-img.png'

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
      <span data-testid="test-img-src">{testImg.src}</span>
      <Image data-testid="test-img" src={testImg} alt="test" />
    </>
  )
}
