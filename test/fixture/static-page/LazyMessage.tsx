import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/router'
import testImg from './test-img.png'
// below Vite's assetsInlineLimit — must still resolve to a file URL, not a data: URI
import smallIcon from './small-icon.svg'

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
      <span data-testid="small-svg-src">{smallIcon.src}</span>
      <Image data-testid="test-img" src={testImg} alt="test" />
    </>
  )
}
