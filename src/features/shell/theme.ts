import { SystemBars, SystemBarsStyle } from '@capacitor/core'
import { useEffect } from 'react'
import { db } from '../../db'

export type ThemePref = 'system' | 'light' | 'dark'
export const THEME_KEY = 'look.theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'
const mq = () => (typeof matchMedia === 'function' ? matchMedia(DARK_QUERY) : null)

/** Status-bar icon colour: Light = dark icons (for the cream app), Dark = light icons. */
export const barStyle = (dark: boolean): SystemBarsStyle => (dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light)

// The native plugin freezes its own DEFAULT at start, so always send an explicit style. No-op in a browser.
const setBars = (dark: boolean) => void Promise.resolve(SystemBars.setStyle({ style: barStyle(dark) })).catch(() => undefined)

let stopWatch: (() => void) | undefined
export function stopWatchingSystem() { stopWatch?.(); stopWatch = undefined }

/** System = no data-theme attribute, so the prefers-color-scheme rule in tokens.css decides; the bar icons follow the phone live. */
export function applyTheme(t: ThemePref) {
  stopWatchingSystem()
  if (t === 'system') {
    delete document.documentElement.dataset.theme
    const q = mq()
    setBars(!!q?.matches)
    if (q) {
      const on = () => setBars(q.matches)
      q.addEventListener('change', on)
      stopWatch = () => q.removeEventListener('change', on)
    }
  } else {
    document.documentElement.dataset.theme = t
    setBars(t === 'dark')
  }
}

/** Apply the saved theme once at app start (system when nothing is saved). */
export function useSavedTheme() {
  useEffect(() => {
    void db.kv.get(THEME_KEY).then((r) => applyTheme(r?.value === 'light' || r?.value === 'dark' ? r.value : 'system'), () => applyTheme('system'))
    return stopWatchingSystem
  }, [])
}
