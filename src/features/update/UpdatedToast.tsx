import { useEffect, useState } from 'react'

const FLAG = 'bantay.updated'

/** Reload for a new service worker only when it cannot cost the user anything: never while typing or in the SOS flow. */
export function canReloadNow(o: { hidden: boolean; typing: boolean; inSos: boolean }): boolean {
  return !o.inSos && (o.hidden || !o.typing)
}
const state = () => {
  const a = document.activeElement
  return {
    hidden: document.visibilityState === 'hidden',
    typing: !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a as HTMLElement).isContentEditable),
    inSos: !!document.querySelector('.sos-page, .sos-btn.holding, .sos-confirm') // also mid-hold and the confirm step
  }
}
const flag = (v?: string) => { try { return v ? sessionStorage.setItem(FLAG, v) : sessionStorage.getItem(FLAG) } catch { return null } }

/** A-101: a live web deploy swaps the service worker; the running page then reloads at a safe moment so the new bundle runs, and says so.
 *  Checks for a new version whenever the app comes back to the front (browser tab or Android app). Silent on first install. */
export function UpdatedToast() {
  const [show, setShow] = useState(() => { const f = flag(); if (f) { try { sessionStorage.removeItem(FLAG) } catch { /* ignore */ } } return !!f })
  useEffect(() => {
    if (!show) return
    const t = setTimeout(() => setShow(false), 4000)
    return () => clearTimeout(t)
  }, [show])
  useEffect(() => {
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined
    if (!sw) return
    const check = () => { if (document.visibilityState === 'visible') void sw.getRegistration().then((r) => r?.update()).catch(() => undefined) }
    document.addEventListener('visibilitychange', check)
    let off: (() => void) | undefined
    let gone = false
    void import('@capacitor/app').then(({ App }) => App.addListener('appStateChange', (s) => { if (s.isActive) check() })).then((h) => { if (gone) void h.remove(); else off = () => void h.remove() }).catch(() => undefined) // not native: nothing to listen to
    let pending = false
    const reload = () => { flag('1'); location.reload() }
    const tryNow = () => { if (pending && canReloadNow(state())) { pending = false; reload() } }
    const hadController = !!sw.controller // first install is silent: no previous controller
    const swapped = () => { if (!hadController) return; pending = true; tryNow() }
    const nav = () => { if (pending && !state().inSos) { pending = false; reload() } }
    const vis = () => { if (document.visibilityState === 'hidden') tryNow() }
    sw.addEventListener('controllerchange', swapped)
    window.addEventListener('hashchange', nav)
    document.addEventListener('visibilitychange', vis)
    return () => {
      gone = true; off?.()
      document.removeEventListener('visibilitychange', check); document.removeEventListener('visibilitychange', vis)
      sw.removeEventListener('controllerchange', swapped); window.removeEventListener('hashchange', nav)
    }
  }, [])
  return show ? <div className="toast" role="status">Bantay was updated</div> : null
}
