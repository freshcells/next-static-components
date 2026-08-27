import React from 'react'
import dynamic from 'next/dynamic'
import './styles.css'
import type { Entrypoint } from '@freshcells/next-static-components'
import WhitelabelBanner from '../src/WhitelabelBanner'
import LinksShowcase from './LinksShowcase'

interface Props {
  greeting: string
}

interface Context {
  greeting: string
}

const LazyMessage = dynamic(() => import('./LazyMessage'))

const HelloWorld = ({ greeting }: Props) => (
  <section data-testid="hello" className="fixture-styles">
    <h1>{greeting}</h1>
    <p>Rendered by next-static-components.</p>
    <WhitelabelBanner />
    <LazyMessage />
  </section>
)

const entry: Entrypoint<Props, Context> = async (context) => ({
  props: { greeting: context.greeting },
  components: [HelloWorld, LinksShowcase],
  additionalHeadElement: <title>Fixture</title>,
})

export default entry
