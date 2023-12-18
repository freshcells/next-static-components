import nextBabelPreset from 'next/dist/build/babel/preset.js'
import loadablePlugin from 'next/dist/build/babel/plugins/react-loadable-plugin.js'

export default (api: any, options?: any): any => {
  const result = nextBabelPreset(api, options)
  return {
    ...result,
    plugins: [
      [
        require('@loadable/babel-plugin'),
        {
          signatures: [
            { name: 'default', from: 'next/dynamic' },
            { name: 'default', from: '@loadable/component' },
          ],
        },
      ],
      ...(result.plugins?.filter((plugin) => {
        return plugin.default !== loadablePlugin
      }) || []),
    ],
  }
}
