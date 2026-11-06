import { useEffect, useState } from 'react'
import type { NewsRow } from './model'

const KEY = 'bantay.discover.saved'
const EVT = 'bantay:saved'
export const SAVED_MAX = 50

/** Read-later list, newest saved first, kept only on this phone. Storage can throw (private mode): then the list is empty and saving does nothing. */
export function readSaved(): NewsRow[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.filter((n) => n && typeof n.id === 'string' && typeof n.url === 'string') : [] } catch { return [] }
}
export function toggleSaved(n: NewsRow): void {
  const cur = readSaved()
  const next = cur.some((s) => s.id === n.id) ? cur.filter((s) => s.id !== n.id)
    : [{ id: n.id, title: n.title, url: n.url, source: n.source, kind: n.kind, published_at: n.published_at, image_url: n.image_url ?? null, topic: n.topic ?? null }, ...cur].slice(0, SAVED_MAX)
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private mode or full */ }
  window.dispatchEvent(new Event(EVT))
}
export function useSaved(): NewsRow[] {
  const [list, setList] = useState(readSaved)
  useEffect(() => {
    const sync = () => setList(readSaved())
    window.addEventListener(EVT, sync); window.addEventListener('storage', sync)
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener('storage', sync) }
  }, [])
  return list
}
