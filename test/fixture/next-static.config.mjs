// @ts-check
import { defineConfig } from '@freshcells/next-static-components'

export default defineConfig({
  entry: './static-page/entrypoint.tsx',
  postcssConfig: {
    plugins: [
      {
        postcssPlugin: 'fixture-marker',
        Once(root) {
          root.append('.postcss-marker-applied{color:green}')
        },
      },
    ],
  },
})
