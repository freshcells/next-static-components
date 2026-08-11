import Link from 'next/link'

const LinksShowcase = () => (
  <nav data-testid="links">
    <Link data-testid="link-default" href="/details">
      Details
    </Link>
    <Link data-testid="link-root" href="/">
      Home
    </Link>
    <Link data-testid="link-trailing" href="/details/">
      Trailing
    </Link>
    <Link data-testid="link-locale-de" href="/details" locale="de">
      German
    </Link>
    <Link data-testid="link-locale-en" href="/details" locale="en">
      English
    </Link>
    <Link data-testid="link-locale-en-gb" href="/details" locale="en-gb">
      British
    </Link>
    <Link data-testid="link-locale-false" href="/details" locale={false}>
      Unlocalized
    </Link>
    <Link data-testid="link-external" href="https://external.example/x">
      External
    </Link>
    <Link data-testid="link-mailto" href="mailto:x@y.z">
      Mail
    </Link>
    <Link data-testid="link-hash" href="#section">
      Anchor
    </Link>
    <Link data-testid="link-urlobject" href={{ pathname: '/search', query: { q: 'x' } }}>
      Search
    </Link>
    <Link data-testid="link-dynamic" href={{ pathname: '/blog/[slug]', query: { slug: 'hello' } }}>
      Blog
    </Link>
    <Link data-testid="link-as" href="/details" as="/nice-path">
      Masked
    </Link>
  </nav>
)

export default LinksShowcase
