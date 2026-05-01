import React from 'react'
import dynamic from 'next/dynamic'
import type { Entrypoint } from '@freshcells/next-static-components'

interface Props {
  greeting: string
}

interface Context {
  greeting: string
}

const LazyMessage = dynamic(() => import('./LazyMessage'))

const HelloWorld = ({ greeting }: Props) => (
  <section data-testid="hello">
    <h1>{greeting}</h1>
    <p>Rendered by next-static-components.</p>
    <LazyMessage />
  </section>
)

const entry: Entrypoint<Props, Context> = async (context) => ({
  props: { greeting: context.greeting },
  components: [HelloWorld],
  additionalHeadElement: <title>Fixture</title>,
})

export default entry
