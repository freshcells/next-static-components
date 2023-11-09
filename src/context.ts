import type { NextRouter } from 'next/router.js'
import { createContext } from 'react'

export const RouterContext = createContext<NextRouter | null>(null)
