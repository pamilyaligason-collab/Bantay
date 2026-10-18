import { useEffect, useState } from 'react'

/** A-101: after a live web deploy swaps the service worker, say so on the next screen change. Silent on first install (no previous controller). */
export function UpdatedToast() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined
    if (!sw?.controller) return
    let pending = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const swapped = () => { pending = true }
    const nav = () => {
      if (!pending) return
      pending = false
      setShow(true)
      clearTimeout(timer)
      timer = setTimeout(() => setShow(false), 4000)
    }
    sw.addEventListener('controllerchange', swapped)
    window.addEventListener('hashchange', nav)
    return () => { sw.removeEventListener('controllerchange', swapped); window.removeEventListener('hashchange', nav); clearTimeout(timer) }
  }, [])
  return show ? <div className="toast" role="status">Bantay was updated</div> : null
}
