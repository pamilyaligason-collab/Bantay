import { useEffect, useState } from 'react'
import { db } from '../../db'
import type { Msg } from './tools'

export const HISTORY_MAX = 20
/** A chat clears itself this long after its last message (Lloyd 2026-11-10: "chat should also auto clear after conversations"). */
export const CHAT_IDLE_MS = 30 * 60_000
export const chatIsStale = (lastAt: number, now = Date.now()) => now - lastAt >= CHAT_IDLE_MS
const KEY = 'assistant.history'

/** The caution line under the Ask title. */
export const CAUTION = 'I can be wrong. Check with your doctor for medical decisions.'

type Saved = Msg & { local?: boolean }

/** What stays on the phone: the last 20 messages with text. Cards (drafts, record answers) are not kept, so nothing can be confirmed from an old chat. */
export function trimHistory<T extends Saved>(items: T[], max = HISTORY_MAX): Saved[] {
  return items
    .filter((m) => typeof m.content === 'string' && m.content.trim() !== '')
    .slice(-max)
    .map((m) => (m.local ? { role: m.role, content: m.content, local: true } : { role: m.role, content: m.content }))
}

/** The saved chat, or [] once it is CHAT_IDLE_MS old (then it is also deleted from the phone). A bare array is the pre-2026-11-10 shape and is read as before. */
export async function loadHistory(now = Date.now()): Promise<Saved[]> {
  try {
    const raw = (await db.kv.get(KEY))?.value as unknown
    const box = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { at?: unknown; items?: unknown }) : null
    if (box && typeof box.at === 'number' && chatIsStale(box.at, now)) { await clearHistory(); return [] }
    const v = box ? box.items : raw
    if (!Array.isArray(v)) return []
    return trimHistory((v as unknown[]).filter((m): m is Saved => !!m && typeof m === 'object' && ((m as Saved).role === 'user' || (m as Saved).role === 'assistant') && typeof (m as Saved).content === 'string'))
  } catch { return [] }
}

export async function saveHistory(items: Saved[], now = Date.now()): Promise<void> {
  try { await db.kv.put({ key: KEY, value: { at: now, items: trimHistory(items) } }) } catch { /* the chat still works without the copy */ }
}

export async function clearHistory(): Promise<void> {
  try { await db.kv.delete(KEY) } catch { /* nothing saved */ }
}

/** Pixels the on-screen keyboard covers at the bottom of the layout viewport. 0 when it is closed, small browser-bar changes, or visualViewport is missing. */
export const keyboardInset = (innerHeight: number, vvHeight: number, vvOffsetTop: number) => {
  const covered = Math.round(innerHeight - vvHeight - vvOffsetTop)
  return covered > 80 ? covered : 0
}

/** Live keyboard height from visualViewport, so the composer sits directly above the keyboard. */
export function useKeyboardInset(active: boolean): number {
  const [kb, setKb] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!active || !vv) { setKb(0); return }
    const on = () => setKb(keyboardInset(window.innerHeight, vv.height, vv.offsetTop))
    on()
    vv.addEventListener('resize', on)
    vv.addEventListener('scroll', on)
    return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on) }
  }, [active])
  return kb
}
