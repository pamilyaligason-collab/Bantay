import { useEffect } from 'react'
import { db } from '../../db'

export type ThemePref = 'system' | 'light' | 'dark'
export const THEME_KEY = 'look.theme'

/** System = no data-theme attribute, so the prefers-color-scheme rule in tokens.css decides. */
export function applyTheme(t: ThemePref) {
  if (t === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = t
}

/** Apply the saved theme once at app start. */
export function useSavedTheme() {
  useEffect(() => {
    void db.kv.get(THEME_KEY).then((r) => { if (r?.value === 'light' || r?.value === 'dark') applyTheme(r.value) }, () => undefined)
  }, [])
}
