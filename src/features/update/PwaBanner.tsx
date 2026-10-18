import { Capacitor } from '@capacitor/core'
import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { db } from '../../db'
import { syncCounts } from '../sync/sync'

const LATER_KEY = 'update.pwaLaterAt'
const DAY = 24 * 3600_000
export const GET_URL = 'https://bantay.pages.dev/get/'

/** D-35: only the installed web app on Android. Never iPhone (no app to switch to), never inside the APK. */
export const shouldShowPwaBanner = (o: { standalone: boolean; ua: string; native: boolean; laterAt?: number | null; now?: number }) =>
  o.standalone && !o.native && /Android/.test(o.ua) && !/iPhone|iPad/.test(o.ua) &&
  !(typeof o.laterAt === 'number' && (o.now ?? Date.now()) - o.laterAt < DAY)

/** waiting = outbox rows not yet sent; null = unknown. Unknown is never "all saved". */
export function bannerSteps(waiting: number | null) {
  if (waiting === null) return { saved: 'Checking what is saved...', removeEnabled: false }
  if (waiting === 0) return { saved: 'All saved to the family account', removeEnabled: true }
  return { saved: `${waiting} ${waiting === 1 ? 'entry' : 'entries'} still waiting, connect to send`, removeEnabled: false }
}

const card = { background: 'var(--card, #FFFCF6)', color: 'var(--ink, #1D1F1C)', borderRadius: 24, padding: 16, display: 'grid', gap: 10 } as const
const pill = { minHeight: 44, padding: '0 18px', borderRadius: 999, border: 0, fontWeight: 600, font: 'inherit' } as const

/** Standalone: the orchestrator mounts it above the Today content. */
export function PwaBanner() {
  const [laterAt, setLaterAt] = useState<number | null>(null)
  const [waiting, setWaiting] = useState<number | null>(null)
  useEffect(() => {
    const sub = liveQuery(async () => ({ later: (await db.kv.get(LATER_KEY))?.value, c: await syncCounts() })).subscribe({
      next: ({ later, c }) => {
        setLaterAt(typeof later === 'number' ? later : null)
        setWaiting(c.waiting + c.unknown) // rows we will not send still are not on the server
      },
      error: () => {}
    })
    return () => sub.unsubscribe()
  }, [])
  const show = shouldShowPwaBanner({
    standalone: window.matchMedia('(display-mode: standalone)').matches,
    ua: navigator.userAgent,
    native: Capacitor.isNativePlatform(),
    laterAt
  })
  if (!show) return null
  const s = bannerSteps(waiting)
  return (
    <section aria-label="Bantay is now an app" style={{ display: 'grid', gap: 12 }}>
      <div style={{ ...card, background: 'var(--green, #1F3D2B)', color: 'var(--on-green, #F6F1E7)' }}>
        <b style={{ fontSize: 17 }}>Bantay is now an app</b>
        <div style={{ opacity: 0.85, fontSize: 13 }}>Faster, works offline, real reminders and Open Settings shortcuts.</div>
        <div style={{ display: 'flex', gap: 12 }}>
          <a href={GET_URL} style={{ ...pill, display: 'inline-flex', alignItems: 'center', background: 'var(--on-green, #F6F1E7)', color: '#1F3D2B', textDecoration: 'none' }}>
            Get the app
          </a>
          <button type="button" style={{ ...pill, background: 'rgba(255,255,255,.12)', color: 'inherit' }} onClick={() => void db.kv.put({ key: LATER_KEY, value: Date.now() })}>
            Later
          </button>
        </div>
      </div>
      <ol style={{ ...card, margin: 0, padding: 16, listStyle: 'none', fontSize: 14 }}>
        <li>1. Install the app from the link and sign in again (the web version and the app keep separate logins).</li>
        <li role="status">2. {s.saved}</li>
        <li aria-disabled={!s.removeEnabled} style={{ opacity: s.removeEnabled ? 1 : 0.6 }}>
          3. {s.removeEnabled ? 'Now remove this old icon: long-press it and choose Uninstall.' : 'Held until everything is saved. Then remove this old icon: long-press it and choose Uninstall.'}
        </li>
      </ol>
    </section>
  )
}
