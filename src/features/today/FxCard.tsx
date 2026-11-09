import { useEffect, useRef, useState } from 'react'
import { Section } from '../look'
import { track } from '../admin/events'
import { useKv } from '../shell/useKv'
import './fx.css'

export const FX_URL = 'https://open.er-api.com/v6/latest/USD'
export const FX_NOTE = 'Market rate, not the BSP reference rate.'
export interface FxSaved { php: number; at: number; prev: number | null; prevAt: number | null }

const dayOf = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` } // the phone's own day
const timeOf = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const dayWord = (ms: number, now: number) => (dayOf(ms) === dayOf(now - 86_400_000) ? 'yesterday' : new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }))
const peso = (n: number) => `₱${n.toFixed(2)}`
/** The saved value moves to "previous" only when a new day's rate arrives, so a same-day reload never erases the comparison. */
export const nextSaved = (saved: FxSaved | undefined, php: number, now: number): FxSaved => ({ php, at: now, prev: saved ? saved.php : null, prevAt: saved ? saved.at : null })

/** One GET. Null on any failure or a rate that is not a positive number. */
export async function fetchPhp(): Promise<number | null> {
  try {
    const r = await fetch(FX_URL, { signal: 'timeout' in AbortSignal ? AbortSignal.timeout(8000) : undefined })
    if (!r.ok) return null
    const j = (await r.json()) as { result?: string; rates?: { PHP?: unknown } }
    const v = j.rates?.PHP
    return j.result === 'success' && typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
  } catch { return null }
}

/** S26 (D-164): US dollar in pesos on Today. open.er-api.com at most once a day (no key), saved on the phone. Hidden until a rate has ever been read.
 *  Offline or failed: the saved rate shows with an "Offline" chip that names its time. */
export default function FxCard() {
  const [saved, setSaved, loaded] = useKv<FxSaved | undefined>('fx.usd', undefined)
  const [failed, setFailed] = useState(false)
  const asked = useRef(false)
  useEffect(() => {
    if (!loaded || asked.current) return
    if (saved && dayOf(saved.at) === dayOf(Date.now())) return
    asked.current = true
    void fetchPhp().then((php) => { if (php === null) setFailed(true); else setSaved(nextSaved(saved, php, Date.now())) })
  }, [loaded, saved, setSaved])
  const has = !!saved
  useEffect(() => { if (has) void track('action', 'card_fx') }, [has]) // shown (D-160)
  if (!saved) return null
  const offline = failed && dayOf(saved.at) !== dayOf(Date.now())
  const diff = saved.prev === null ? null : Math.round((saved.php - saved.prev) * 100) / 100
  const since = saved.prevAt === null ? '' : ` since ${dayWord(saved.prevAt, saved.at)}`
  return (
    <Section title="US dollar today" testId="today-fx">
      <div className="card fx" data-testid="fx-card">
        {offline && <span className="fx-chip" role="status">Offline · rate from {timeOf(saved.at)}</span>}
        <div className="fx-top">
          <div><div className="fx-rate">{peso(saved.php)}</div><div className="fx-sub">for 1 US dollar</div></div>
          {diff !== null && (
            <div className="fx-chg" data-testid="fx-change">
              {diff === 0 ? <>No change{since}</> : <><span aria-hidden="true">{diff > 0 ? '▲' : '▼'}</span> {diff > 0 ? 'Up' : 'Down'} {peso(Math.abs(diff))}{since}</>}
            </div>
          )}
        </div>
        <p className="fx-note">{FX_NOTE}</p>
        <a className="fx-credit" href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Rates by exchangerate-api.com</a>
      </div>
    </Section>
  )
}
