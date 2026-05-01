import type { Plugin } from 'vite'

interface Options {
  routerShim: string
  dynamicShim: string
}

/**
 * Owns alias resolution for `next/router` and `next/dynamic`.
 *
 * `vite-plugin-storybook-nextjs`'s `vitePluginNextMocks` subplugin aliases
 * those keys to its empty test-mock files (which import `storybook/internal/*`
 * — unavailable outside Storybook). The mock subplugin is filtered out at the
 * config level (see `vite-config.ts`), so this plugin only needs to provide
 * the positive aliases for our shims, plus a defensive stub for the storybook
 * imports in case any mock still ends up in the graph through a future plugin
 * change.
 *
 * React aliases are intentionally NOT touched — Vite's normal node_modules
 * resolution picks up the consumer's hoisted React, which is what we want.
 */
export const overrideAliasesPlugin = ({ routerShim, dynamicShim }: Options): Plugin => ({
  name: 'next-static:override-aliases',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'next/router') return routerShim
    if (id === 'next/dynamic') return dynamicShim
    if (id === 'storybook/internal/preview-errors' || id === 'storybook/test') {
      return '\0next-static:storybook-stub'
    }
    return null
  },
  load(id) {
    if (id === '\0next-static:storybook-stub') {
      return `
        export const fn = (impl) => impl;
        export const NextjsRouterMocksNotAvailable = class extends Error {
          constructor(message) { super(message ?? 'next/router mock unavailable'); }
        };
        export const NextjsNavigationMocksNotAvailable = class extends Error {
          constructor(message) { super(message ?? 'next/navigation mock unavailable'); }
        };
        export default {};
      `
    }
    return null
  },
})
