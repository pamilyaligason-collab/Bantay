import { useSyncExternalStore } from 'react'

const Q = '(prefers-reduced-motion: reduce)'
const sub = (cb: () => void) => {
  if (typeof matchMedia !== 'function') return () => {}
  const m = matchMedia(Q)
  m.addEventListener('change', cb)
  return () => m.removeEventListener('change', cb)
}
export const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia(Q).matches

export function useReducedMotion() {
  return useSyncExternalStore(sub, prefersReducedMotion, () => false)
}
