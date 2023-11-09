import { RouterContext } from './context.js'
import Router from 'next/dist/client/router.js'
import { useContext } from 'react'

export const useRouter = () => {
  return useContext(RouterContext)
}

export default Router
