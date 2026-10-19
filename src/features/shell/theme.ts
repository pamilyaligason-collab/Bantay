import { SystemBars, SystemBarsStyle } from '@capacitor/core'
import { useEffect } from 'react'
import { db } from '../../db'

export type ThemePref = 'system' | 'light' | 'dark'
export const THEME_KEY = 'look.theme'

/** Status-bar icon colour: Light = dark icons (for the cream app), Dark = light icons. System follows the phone. */
export const barStyle = (t: ThemePref): SystemBarsStyle => (t === 'light' ? SystemBarsStyle.Light : t === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Default)

/** System = no data-theme attribute, so the prefers-color-scheme rule in tokens.css decides. */
export function applyTheme(t: ThemePref) {
  if (t === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = t
  // The native plugin resets to the phone's own theme on start, so say what the app theme is. No-op in a browser.
  void Promise.resolve(SystemBars.setStyle({ style: barStyle(t) })).catch(() => undefined)
}

/** Apply the saved theme once at app start. */
export function useSavedTheme() {
  useEffect(() => {
    void db.kv.get(THEME_KEY).then((r) => { if (r?.value === 'light' || r?.value === 'dark') applyTheme(r.value) }, () => undefined)
  }, [])
}
