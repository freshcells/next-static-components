declare module '@nextConfig' {
  export default {}
}

declare module '@main' {
  import type { ComponentType } from 'react'

  type Result<T> = {
    props: T
    components: ComponentType<T>[]
    wrapper?: ComponentType<{ components: JSX.Element[] }>
  }

  declare function Entrypoint<Props = {}, Context = {}>(
    context: Context
  ): Promise<Result<Props>>

  export default Entrypoint
}
