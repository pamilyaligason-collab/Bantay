import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { type Activity, ldb } from '../log/store'
import { dayKey } from '../notify/push'
import { capgoBridge, isNative } from './bridge'
import { syncOnResume } from './health'

/** Start of today in Manila (UTC+8, no daylight saving). */
const dayStart = () => new Date(`${dayKey(new Date())}T00:00:00+08:00`).toISOString()
const SLEEP_WINDOW_MS = 36 * 3_600_000

export const summarise = (rows: Activity[], dayStartIso: string, now = Date.now()) => {
  const today = rows.filter((a) => a.startedAt >= dayStartIso)
  const walk = today.filter((a) => a.kind !== 'sleep').reduce((n, a) => n + (a.minutes ?? 0), 0)
  const steps = today.reduce((n, a) => n + (a.kind === 'steps' ? (a.steps ?? 0) : 0), 0)
  const cut = new Date(now - SLEEP_WINDOW_MS).toISOString()
  const sleep = rows.filter((a) => a.kind === 'sleep' && a.startedAt >= cut).reduce((n, a) => n + (a.minutes ?? 0), 0) || null
  return { walk, steps, sleep }
}
const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`)

/** What moved today, from walks the person logged and anything synced from the phone's health store. */
export default function MovementCard({ native = isNative(), embedded = false }: { native?: boolean; embedded?: boolean }) {
  const [rows, setRows] = useState<Activity[]>([])
  useEffect(() => {
    const since = new Date(Date.now() - SLEEP_WINDOW_MS).toISOString()
    const sub = liveQuery(() => ldb.activity.where('startedAt').aboveOrEqual(since < dayStart() ? since : dayStart()).toArray()).subscribe({ next: setRows, error: () => {} })
    const stop = native ? syncOnResume(capgoBridge()) : undefined
    return () => { sub.unsubscribe(); stop?.() }
  }, [native])

  const { walk, steps, sleep } = summarise(rows, dayStart())
  const parts = [walk ? `${hm(walk)} moving` : '', steps ? `${steps.toLocaleString('en-PH')} steps` : '', sleep ? `slept ${hm(sleep)}` : ''].filter(Boolean)
  const body = (
    <>
      <strong>{parts.length ? parts.join(', ') : 'Nothing logged yet today'}</strong>
      {steps > 0 && <div className="sub">Steps come from your phone and are approximate.</div>}
    </>
  )
  if (embedded) return <div className="td-mv">{body}</div>
  return (
    <section aria-labelledby="mv-h">
      <h2 id="mv-h" className="hd">Movement</h2>
      <div className="grp" style={{ padding: 16 }}>{body}</div>
    </section>
  )
}
