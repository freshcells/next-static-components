import { RouterContext } from './context.js'
import { useContext } from 'react'

export const useRouter = () => {
  return useContext(RouterContext)
}

export default {}
