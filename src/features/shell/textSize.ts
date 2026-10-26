import { useEffect } from 'react'
import { db } from '../../db'

export type TextSize = 'normal' | 'large' | 'xlarge'
export const TEXT_SIZE_KEY = 'look.textsize'
export const TEXT_SIZES: { id: TextSize; label: string; scale: number }[] = [
  { id: 'normal', label: 'Normal', scale: 1 },
  { id: 'large', label: 'Large', scale: 1.15 },
  { id: 'xlarge', label: 'Extra large', scale: 1.3 }
]

export const isTextSize = (v: unknown): v is TextSize => TEXT_SIZES.some((t) => t.id === v)

/** Sets --text-scale on <html>; app.css zooms the scroller and sheets by it. Normal removes the attribute so nothing changes. */
export function applyTextSize(t: TextSize) {
  const root = document.documentElement
  const scale = TEXT_SIZES.find((s) => s.id === t)?.scale ?? 1
  if (scale === 1) { delete root.dataset.text; root.style.removeProperty('--text-scale') }
  else { root.dataset.text = t; root.style.setProperty('--text-scale', String(scale)) }
}

/** Apply the saved text size once at app start. */
export function useSavedTextSize() {
  useEffect(() => {
    void db.kv.get(TEXT_SIZE_KEY).then((r) => applyTextSize(isTextSize(r?.value) ? r.value : 'normal'), () => undefined)
  }, [])
}
